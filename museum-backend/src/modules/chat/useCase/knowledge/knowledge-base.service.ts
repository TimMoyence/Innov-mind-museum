import { buildKnowledgeBasePromptBlock } from '@modules/chat/useCase/knowledge/knowledge-base.prompt';
import { logger } from '@shared/logger/logger';

import type {
  ArtworkFacts,
  KnowledgeBaseProvider,
  KnowledgeBaseServiceConfig,
} from '@modules/chat/domain/ports/knowledge-base.port';
import type { CacheService } from '@shared/cache/cache.port';

/** Internal cache entry storing facts. */
interface CacheEntry {
  facts: ArtworkFacts | null;
}

/**
 * Knowledge base service with Redis cache, timeout, and fail-open behavior.
 *
 * Wraps a {@link KnowledgeBaseProvider} with:
 * - **Cache**: Redis-backed via {@link CacheService} with TTL (falls back to no-cache when unavailable).
 * - **Timeout**: aborts the provider call after `config.timeoutMs`.
 * - **Fail-open**: any error (timeout, network, cache, etc.) returns `''` so the chat
 *   pipeline continues without knowledge-base enrichment.
 */
export class KnowledgeBaseService {
  constructor(
    private readonly provider: KnowledgeBaseProvider,
    private readonly config: KnowledgeBaseServiceConfig,
    private readonly cacheService?: CacheService,
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

    const cacheKey = `kb:wikidata:${key}`;

    // Check cache (fail-open: cache errors fall through to provider)
    if (this.cacheService) {
      try {
        const cached = await this.cacheService.get<CacheEntry>(cacheKey);
        if (cached) {
          logger.info('kb_cache_hit', { searchTerm: key });
          return cached.facts;
        }
      } catch {
        // fail-open: cache read error, proceed to provider
      }
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

        // Store in cache (fail-open: cache write errors are swallowed)
        if (this.cacheService) {
          try {
            await this.cacheService.set(cacheKey, { facts }, this.config.cacheTtlSeconds);
          } catch {
            // fail-open: cache write error does not affect the response
          }
        }

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
}
