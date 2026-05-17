import { logger } from '@shared/logger/logger';

import type {
  SearchResult,
  WebSearchProvider,
  WebSearchQuery,
} from '@modules/chat/domain/ports/web-search.port';

const TAVILY_API_URL = 'https://api.tavily.com/search';
const HARD_RESULT_LIMIT = 10;

interface TavilyApiResult {
  url: string;
  title: string;
  content: string;
}

interface TavilyApiResponse {
  results?: TavilyApiResult[];
}

/** Never throws — any error returns empty array so caller can fail-open. */
export class TavilyClient implements WebSearchProvider {
  readonly name = 'tavily';

  constructor(private readonly apiKey: string) {}

  async search(query: WebSearchQuery): Promise<SearchResult[]> {
    if (!query.query.trim()) return [];

    const maxResults = Math.min(query.maxResults ?? 5, HARD_RESULT_LIMIT);

    try {
      const response = await fetch(TAVILY_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: this.apiKey,
          query: query.query,
          max_results: maxResults,
          search_depth: 'basic',
          include_answer: false,
        }),
        signal: query.signal,
      });

      if (!response.ok) {
        logger.warn('tavily_search_http_error', {
          status: response.status,
          query: query.query,
        });
        return [];
      }

      const data = (await response.json()) as TavilyApiResponse;
      const rawResults = data.results ?? [];

      return rawResults.map((r) => ({
        url: r.url,
        title: r.title,
        snippet: r.content,
      }));
    } catch (err) {
      logger.warn('tavily_search_exception', {
        error: err instanceof Error ? err.message : String(err),
        query: query.query,
      });
      return [];
    }
  }
}
