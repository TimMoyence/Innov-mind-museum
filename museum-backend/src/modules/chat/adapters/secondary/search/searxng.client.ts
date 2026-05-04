import { logger } from '@shared/logger/logger';

import type {
  SearchResult,
  WebSearchProvider,
  WebSearchQuery,
} from '@modules/chat/domain/ports/web-search.port';

const HARD_RESULT_LIMIT = 10;

interface SearXNGApiResult {
  url: string;
  title: string;
  content: string;
}

interface SearXNGApiResponse {
  results?: SearXNGApiResult[];
}

/**
 * SearXNG multi-instance adapter implementing {@link WebSearchProvider}.
 *
 * Rotates through provided instances round-robin, falling back to the next
 * instance on any error. Uses native `fetch` (Node 18+). Never throws from
 * public methods — any error returns an empty array so the caller can fail-open.
 */
export class SearXNGClient implements WebSearchProvider {
  readonly name = 'searxng';

  private nextIndex = 0;

  constructor(private readonly instances: string[]) {}

  /**
   * Searches the web via a SearXNG instance.
   *
   * Tries each instance in rotation order, advancing on failure.
   *
   * @param query - Search term and max results.
   * @returns Search results, or empty array if all instances fail.
   */
  async search(query: WebSearchQuery): Promise<SearchResult[]> {
    if (!query.query.trim()) return [];
    if (this.instances.length === 0) return [];

    const maxResults = Math.min(query.maxResults ?? 5, HARD_RESULT_LIMIT);
    const startIndex = this.nextIndex;

    for (let attempt = 0; attempt < this.instances.length; attempt++) {
      const index = (startIndex + attempt) % this.instances.length;
      const baseUrl = this.instances[index];

      try {
        const params = new URLSearchParams({
          q: query.query,
          format: 'json',
          categories: 'general',
        });

        const response = await fetch(`${baseUrl}/search?${params.toString()}`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal: query.signal,
        });

        if (!response.ok) {
          logger.warn('searxng_search_http_error', {
            status: response.status,
            instance: baseUrl,
            query: query.query,
          });
          // Try next instance
          continue;
        }

        const data = (await response.json()) as SearXNGApiResponse;
        const rawResults = data.results ?? [];

        // Advance the rotation pointer so the next call starts from the next instance
        this.nextIndex = (index + 1) % this.instances.length;

        return rawResults.slice(0, maxResults).map((r) => ({
          url: r.url,
          title: r.title,
          snippet: r.content,
        }));
      } catch (err) {
        logger.warn('searxng_search_exception', {
          error: err instanceof Error ? err.message : String(err),
          instance: baseUrl,
          query: query.query,
        });
        // Try next instance
      }
    }

    logger.warn('searxng_all_instances_failed', { query: query.query });
    return [];
  }
}
