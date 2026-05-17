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
 * Round-robin across instances, falling back to next on any error. Never throws —
 * empty array on all-failures so caller can fail-open.
 */
export class SearXNGClient implements WebSearchProvider {
  readonly name = 'searxng';

  private nextIndex = 0;

  constructor(private readonly instances: string[]) {}

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
          continue;
        }

        const data = (await response.json()) as SearXNGApiResponse;
        const rawResults = data.results ?? [];

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
      }
    }

    logger.warn('searxng_all_instances_failed', { query: query.query });
    return [];
  }
}
