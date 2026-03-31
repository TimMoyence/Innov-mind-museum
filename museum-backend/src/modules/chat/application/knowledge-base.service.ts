import { logger } from '@shared/logger/logger';

import { buildKnowledgeBasePromptBlock } from './knowledge-base.prompt';

import type {
  ArtworkFacts,
  KnowledgeBaseProvider,
  KnowledgeBaseServiceConfig,
} from '../domain/ports/knowledge-base.port';

/** Internal cache entry storing facts and expiration timestamp. */
interface CacheEntry {
  facts: ArtworkFacts | null;
  expiresAt: number;
}

/**
 * Knowledge base service with in-memory LRU cache, timeout, and fail-open behavior.
 *
 * Wraps a {@link KnowledgeBaseProvider} with:
 * - **Cache**: in-memory Map with TTL and max-entries eviction (insertion-order LRU).
 * - **Timeout**: aborts the provider call after `config.timeoutMs`.
 * - **Fail-open**: any error (timeout, network, etc.) returns `''` so the chat
 *   pipeline continues without knowledge-base enrichment.
 */
export class KnowledgeBaseService {
  /** In-memory cache keyed by normalised search term. */
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly provider: KnowledgeBaseProvider,
    private readonly config: KnowledgeBaseServiceConfig,
  ) {}

  /**
   * Looks up artwork facts and returns the raw data.
   *
   * Returns `null` on any failure (timeout, provider error, empty search term,
   * or when the provider returns `null`). Results are cached.
   *
   * @param searchTerm - The artwork name or identifier to look up.
   * @param language - Optional language code for localised results.
   * @returns Raw artwork facts, or `null`.
   */
  async lookupFacts(searchTerm: string, language?: string): Promise<ArtworkFacts | null> {
    const key = searchTerm.toLowerCase().trim();
    if (!key) return null;

    // Check cache
    const cached = this.cache.get(key);
    if (cached) {
      if (Date.now() < cached.expiresAt) {
        logger.info('kb_cache_hit', { searchTerm: key });
        return cached.facts;
      }
      this.cache.delete(key); // expired
    }

    // Fetch with timeout
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => {
        controller.abort();
      }, this.config.timeoutMs);

      try {
        const facts = await Promise.race<ArtworkFacts | null>([
          this.provider.lookup({ searchTerm: key, language }),
          new Promise<null>((_, reject) => {
            controller.signal.addEventListener('abort', () => {
              reject(new Error('KB_TIMEOUT'));
            });
          }),
        ]);

        // Store in cache
        this.evictIfNeeded();
        this.cache.set(key, {
          facts,
          expiresAt: Date.now() + this.config.cacheTtlSeconds * 1000,
        });

        logger.info('kb_lookup_success', { searchTerm: key, found: facts !== null });
        return facts;
      } finally {
        clearTimeout(timeout);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'KB_TIMEOUT') {
        logger.warn('kb_lookup_timeout', { searchTerm: key, timeoutMs: this.config.timeoutMs });
      } else {
        logger.warn('kb_lookup_error', { searchTerm: key, error: message });
      }
      return null;
    }
  }

  /**
   * Looks up artwork facts and returns a formatted prompt block.
   *
   * Returns `''` on any failure (timeout, provider error, empty search term,
   * or when the provider returns `null`).
   *
   * @param searchTerm - The artwork name or identifier to look up.
   * @param language - Optional language code for localised results.
   * @returns A formatted `[KNOWLEDGE BASE]` prompt block, or `''`.
   */
  async lookup(searchTerm: string, language?: string): Promise<string> {
    const facts = await this.lookupFacts(searchTerm, language);
    return buildKnowledgeBasePromptBlock(facts);
  }

  /**
   * Evicts the oldest entry when the cache has reached its maximum size.
   * Uses Map insertion order as a simple LRU approximation.
   */
  private evictIfNeeded(): void {
    if (this.cache.size < this.config.cacheMaxEntries) return;
    // Evict oldest entry (Map preserves insertion order)
    const oldestKey = this.cache.keys().next().value;
    if (oldestKey !== undefined) {
      this.cache.delete(oldestKey);
    }
  }
}
