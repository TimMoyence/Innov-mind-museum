import { errorMessage } from '@shared/errors/error-message';
import { logger } from '@shared/logger/logger';

import { buildWebSearchPromptBlock } from './web-search.prompt';

import type {
  SearchResult,
  WebSearchProvider,
  WebSearchServiceConfig,
} from '@modules/chat/domain/ports/web-search.port';
import type { CacheService } from '@shared/cache/cache.port';

interface CacheEntry {
  results: SearchResult[];
}

export class WebSearchService {
  constructor(
    private readonly provider: WebSearchProvider,
    private readonly config: WebSearchServiceConfig,
    private readonly cacheService?: CacheService,
  ) {}

  async searchRaw(searchQuery: string): Promise<SearchResult[]> {
    const key = searchQuery.toLowerCase().trim();
    if (!key) return [];

    const cacheKey = `ws:search:${key}`;

    if (this.cacheService) {
      try {
        const cached = await this.cacheService.get<CacheEntry>(cacheKey);
        if (cached) {
          logger.info('web_search_cache_hit', { query: key });
          return cached.results;
        }
      } catch {}
    }

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

        if (this.cacheService) {
          try {
            await this.cacheService.set(cacheKey, { results }, this.config.cacheTtlSeconds);
          } catch {}
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
      const message = errorMessage(err);
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

  async search(searchQuery: string): Promise<string> {
    const results = await this.searchRaw(searchQuery);
    return buildWebSearchPromptBlock(results);
  }
}
