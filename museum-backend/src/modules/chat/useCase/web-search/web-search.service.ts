import { buildWebSearchPromptBlock } from '@modules/chat/useCase/web-search/web-search.prompt';
import { logger } from '@shared/logger/logger';

import type {
  SearchResult,
  WebSearchProvider,
  WebSearchServiceConfig,
} from '@modules/chat/domain/ports/web-search.port';
import type { CacheService } from '@shared/cache/cache.port';

/** Internal cache entry storing search results. */
interface CacheEntry {
  results: SearchResult[];
}

/**
 * Web search service with Redis cache, timeout, and fail-open behavior.
 *
 * Wraps a {@link WebSearchProvider} with:
 * - **Cache**: Redis-backed via {@link CacheService} with TTL (falls back to no-cache when unavailable).
 * - **Timeout**: aborts the provider call after `config.timeoutMs`.
 * - **Fail-open**: any error (timeout, network, cache, etc.) returns `''` so the chat
 *   pipeline continues without web search enrichment.
 */
export class WebSearchService {
  constructor(
    private readonly provider: WebSearchProvider,
    private readonly config: WebSearchServiceConfig,
    private readonly cacheService?: CacheService,
  ) {}

  /**
   * Searches the web and returns the raw results.
   *
   * Returns an empty array on any failure (timeout, provider error, empty query).
   * Results are cached.
   *
   * @param searchQuery - The search term to look up.
   * @returns Search results, or empty array.
   */
  async searchRaw(searchQuery: string): Promise<SearchResult[]> {
    const key = searchQuery.toLowerCase().trim();
    if (!key) return [];

    const cacheKey = `ws:search:${key}`;

    // Check cache (fail-open: cache errors fall through to provider)
    if (this.cacheService) {
      try {
        const cached = await this.cacheService.get<CacheEntry>(cacheKey);
        if (cached) {
          logger.info('web_search_cache_hit', { query: key });
          return cached.results;
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
        const results = await Promise.race<SearchResult[]>([
          this.provider.search({
            query: searchQuery,
            maxResults: this.config.maxResults,
            signal: controller.signal,
          }),
          new Promise<SearchResult[]>((_, reject) => {
            controller.signal.addEventListener('abort', () => {
              reject(new Error('WEB_SEARCH_TIMEOUT'));
            });
          }),
        ]);

        // Store in cache (fail-open: cache write errors are swallowed)
        if (this.cacheService) {
          try {
            await this.cacheService.set(cacheKey, { results }, this.config.cacheTtlSeconds);
          } catch {
            // fail-open: cache write error does not affect the response
          }
        }

        logger.info('web_search_success', {
          query: key,
          resultCount: results.length,
        });
        return results;
      } finally {
        clearTimeout(timeout);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'WEB_SEARCH_TIMEOUT') {
        logger.warn('web_search_timeout', {
          query: key,
          timeoutMs: this.config.timeoutMs,
        });
      } else {
        logger.warn('web_search_error', { query: key, error: message });
      }
      return [];
    }
  }

  /**
   * Searches the web and returns a formatted prompt block.
   *
   * Returns `''` on any failure or no results.
   *
   * @param searchQuery - The search term to look up.
   * @returns A formatted `[WEB SEARCH]` prompt block, or `''`.
   */
  async search(searchQuery: string): Promise<string> {
    const results = await this.searchRaw(searchQuery);
    return buildWebSearchPromptBlock(results);
  }
}
