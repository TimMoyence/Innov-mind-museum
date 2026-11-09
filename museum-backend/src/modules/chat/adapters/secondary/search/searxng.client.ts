import { errorMessage } from '@shared/errors/error-message';
import { logger } from '@shared/logger/logger';

import type {
  SearchResult,
  WebSearchProvider,
  WebSearchQuery,
} from '@modules/chat/domain/ports/web-search.port';

const HARD_RESULT_LIMIT = 10;

interface SearxngApiResult {
  url: string;
  title: string;
  content: string;
}

interface SearxngApiResponse {
  results?: SearxngApiResult[];
}

export class SearxngClient implements WebSearchProvider {
  readonly name = 'searxng';

  constructor(private readonly instances: string[]) {}

  async search(query: WebSearchQuery): Promise<SearchResult[]> {
    if (!query.query.trim()) return [];
    if (this.instances.length === 0) return [];

    const maxResults = Math.min(query.maxResults ?? 5, HARD_RESULT_LIMIT);

    for (const instance of this.instances) {
      const params = new URLSearchParams({
        q: query.query,
        format: 'json',
      });

      try {
        const response = await fetch(`${instance}/search?${params.toString()}`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal: query.signal,
        });

        if (!response.ok) {
          logger.warn('searxng_search_http_error', {
            status: response.status,
            instance,
            query: query.query,
          });
          continue;
        }

        const data = (await response.json()) as SearxngApiResponse;
        const rawResults = Array.isArray(data.results) ? data.results : [];

        if (rawResults.length === 0) continue;

        return rawResults.slice(0, maxResults).map((r) => ({
          url: r.url,
          title: r.title,
          snippet: r.content,
        }));
      } catch (err) {
        logger.warn('searxng_search_exception', {
          error: errorMessage(err),
          instance,
          query: query.query,
        });
        continue;
      }
    }

    return [];
  }
}
