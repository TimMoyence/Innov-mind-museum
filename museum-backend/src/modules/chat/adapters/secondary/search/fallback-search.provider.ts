import { logger } from '@shared/logger/logger';

import type {
  SearchResult,
  WebSearchProvider,
  WebSearchQuery,
} from '@modules/chat/domain/ports/web-search.port';

/**
 * Chains multiple {@link WebSearchProvider} implementations and tries them
 * sequentially. Returns the first non-empty result set. Falls through on
 * empty results or thrown errors, and returns [] if all providers are
 * exhausted.
 */
export class FallbackSearchProvider implements WebSearchProvider {
  readonly name = 'fallback';

  constructor(private readonly providers: WebSearchProvider[]) {}

  /** Tries each provider in order, returning the first non-empty result set. */
  async search(query: WebSearchQuery): Promise<SearchResult[]> {
    for (const provider of this.providers) {
      const providerName = provider.name ?? 'unknown';

      try {
        const results = await provider.search(query);

        if (results.length > 0) {
          logger.info('fallback_search_hit', {
            provider: providerName,
            query: query.query,
            resultCount: results.length,
          });
          return results;
        }

        logger.info('fallback_search_empty', {
          provider: providerName,
          query: query.query,
        });
      } catch (err) {
        logger.warn('fallback_search_provider_error', {
          provider: providerName,
          error: err instanceof Error ? err.message : String(err),
          query: query.query,
        });
      }
    }

    logger.warn('fallback_search_all_failed', { query: query.query });
    return [];
  }
}
