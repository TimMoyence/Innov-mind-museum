import { logger } from '@shared/logger/logger';

import type {
  SearchResult,
  WebSearchProvider,
  WebSearchQuery,
} from '../../domain/ports/web-search.port';

const BRAVE_SEARCH_API_URL = 'https://api.search.brave.com/res/v1/web/search';
const HARD_RESULT_LIMIT = 10;

interface BraveApiResult {
  url: string;
  title: string;
  description: string;
}

interface BraveApiResponse {
  web?: {
    results?: BraveApiResult[];
  };
}

/**
 * Brave Search API adapter implementing {@link WebSearchProvider}.
 *
 * Uses native `fetch` (Node 18+). Never throws from public methods —
 * any error returns an empty array so the caller can fail-open.
 */
export class BraveSearchClient implements WebSearchProvider {
  readonly name = 'brave-search';

  constructor(private readonly apiKey: string) {}

  /**
   * Searches the web via Brave Search API.
   *
   * @param query - Search term and max results.
   * @returns Search results, or empty array on any failure.
   */
  async search(query: WebSearchQuery): Promise<SearchResult[]> {
    if (!query.query.trim()) return [];

    const maxResults = Math.min(query.maxResults ?? 5, HARD_RESULT_LIMIT);

    const params = new URLSearchParams({
      q: query.query,
      count: String(maxResults),
    });

    try {
      const response = await fetch(`${BRAVE_SEARCH_API_URL}?${params.toString()}`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': this.apiKey,
        },
        signal: query.signal,
      });

      if (!response.ok) {
        logger.warn('brave_search_http_error', {
          status: response.status,
          query: query.query,
        });
        return [];
      }

      const data = (await response.json()) as BraveApiResponse;
      const rawResults = data.web?.results ?? [];

      return rawResults.map((r) => ({
        url: r.url,
        title: r.title,
        snippet: r.description,
      }));
    } catch (err) {
      logger.warn('brave_search_exception', {
        error: err instanceof Error ? err.message : String(err),
        query: query.query,
      });
      return [];
    }
  }
}
