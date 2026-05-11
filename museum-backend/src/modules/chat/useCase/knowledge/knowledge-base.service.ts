import { createHash } from 'node:crypto';

import { logger } from '@shared/logger/logger';
import { getLangfuse } from '@shared/observability/langfuse.client';
import { safeTrace } from '@shared/observability/safeTrace';

import { buildKnowledgeBasePromptBlock } from './knowledge-base.prompt';

import type { BreakerState } from '@modules/chat/adapters/secondary/search/wikidata-breaker';
import type {
  ArtworkFacts,
  KnowledgeBaseProvider,
  KnowledgeBaseServiceConfig,
} from '@modules/chat/domain/ports/knowledge-base.port';
import type { WikidataKbDumpRepositoryPort } from '@modules/chat/domain/ports/wikidata-kb-dump.port';
import type { CacheService } from '@shared/cache/cache.port';

/** Internal cache entry storing facts. */
interface CacheEntry {
  facts: ArtworkFacts | null;
}

/**
 * Optional cascade dependencies injected in C5 (Step 5.1).
 * When both are provided, the service consults the local dump after the
 * breaker has been OPEN for at least `localDumpFallbackAfterMs`.
 */
export interface KnowledgeBaseCascadeDeps {
  /** Breaker exposing `getState()` so the cascade can soak-gate the fallback. */
  breakerState: () => BreakerState;
  /** Local Wikidata dump repository (Phase 4 ingest ; noop until then). */
  dumpRepo: WikidataKbDumpRepositoryPort;
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
    private readonly cascade?: KnowledgeBaseCascadeDeps,
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
    const finalize = this.startTrace(key, language);

    // Check cache (fail-open: cache errors fall through to provider)
    if (this.cacheService) {
      try {
        const cached = await this.cacheService.get<CacheEntry>(cacheKey);
        if (cached) {
          logger.info('kb_cache_hit', { searchTerm: key });
          finalize('cache', cached.facts !== null);
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
        let facts = await Promise.race<ArtworkFacts | null>([
          this.provider.lookup({ searchTerm: key, language }),
          new Promise<null>((_, reject) => {
            controller.signal.addEventListener('abort', () => {
              reject(new Error('KB_TIMEOUT'));
            });
          }),
        ]);

        // C5.3 cascade — when the live provider returned null AND the breaker
        // is OPEN past the soak window, consult the local dump. The provider
        // already fails-open (breaker fallback returns null on OPEN), so
        // `facts === null` after a successful resolve is the trigger.
        let source: 'live' | 'dump' = 'live';
        const cascadeDeps = this.cascade;
        if (facts === null && cascadeDeps && this.shouldFallbackToDump()) {
          const dumpFacts = await cascadeDeps.dumpRepo.findFactsBySearchTerm(key, language);
          if (dumpFacts) {
            facts = dumpFacts;
            source = 'dump';
          }
        }

        // Store in cache (fail-open: cache write errors are swallowed)
        if (this.cacheService) {
          try {
            await this.cacheService.set(cacheKey, { facts }, this.config.cacheTtlSeconds);
          } catch {
            // fail-open: cache write error does not affect the response
          }
        }

        logger.info('kb_lookup_success', {
          searchTerm: key,
          found: facts !== null,
          source,
        });
        finalize(facts === null ? 'none' : source, facts !== null);
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
      finalize('none', false);
      return null;
    }
  }

  /**
   * Sets up the C5 Step 6.1 Langfuse span for one `lookupFacts` call and
   * returns a `finalize(source, found)` callback the caller invokes on each
   * exit branch. Hashing the search term keeps spans PII-free.
   */
  private startTrace(
    key: string,
    language?: string,
  ): (source: 'cache' | 'live' | 'dump' | 'none', found: boolean) => void {
    const searchTermHash = createHash('sha256').update(key).digest('hex').slice(0, 16);
    const startedAtMs = Date.now();
    const lf = getLangfuse();
    const trace = safeTrace('chat.knowledge.lookup.create', () =>
      lf?.trace({
        name: 'chat.knowledge.lookup',
        metadata: {
          searchTermHash,
          language: language ?? 'default',
          breakerState: this.cascade?.breakerState().name,
        },
      }),
    );
    return (source, found): void => {
      safeTrace('chat.knowledge.lookup.update', () => {
        trace?.update({
          output: { source, found, latencyMs: Date.now() - startedAtMs },
        });
      });
    };
  }

  /**
   * `true` when the cascade is wired AND the breaker has been OPEN long
   * enough to soak past `localDumpFallbackAfterMs`. HALF_OPEN does NOT
   * trigger the fallback (the breaker is actively probing recovery).
   */
  private shouldFallbackToDump(): boolean {
    if (!this.cascade) return false;
    const state = this.cascade.breakerState();
    if (state.name !== 'OPEN') return false;
    const soak = this.config.localDumpFallbackAfterMs ?? 0;
    if (soak === 0) return true;
    if (state.openSince === undefined) return false;
    return Date.now() - state.openSince >= soak;
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
