import { errorMessage } from '@shared/errors/error-message';
import { logger } from '@shared/logger/logger';

import type {
  SearchResult,
  WebSearchProvider,
  WebSearchQuery,
} from '@modules/chat/domain/ports/web-search.port';

const GOOGLE_CSE_API_URL = 'https://www.googleapis.com/customsearch/v1';
const HARD_RESULT_LIMIT = 10;

export interface GoogleCseConfig {
  apiKey: string;
  cseId: string;
}

interface GoogleCseApiItem {
  link: string;
  title: string;
  snippet: string;
}

interface GoogleCseApiResponse {
  items?: GoogleCseApiItem[];
}

export class GoogleCseClient implements WebSearchProvider {
  readonly name = 'google-cse';

  constructor(private readonly config: GoogleCseConfig) {}

  async search(query: WebSearchQuery): Promise<SearchResult[]> {
    if (!query.query.trim()) return [];

    const maxResults = Math.min(query.maxResults ?? 5, HARD_RESULT_LIMIT);

    const params = new URLSearchParams({
      key: this.config.apiKey,
      cx: this.config.cseId,
      q: query.query,
      num: String(maxResults),
    });

    try {
      const response = await fetch(`${GOOGLE_CSE_API_URL}?${params.toString()}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: query.signal,
      });

      if (!response.ok) {
        logger.warn('google_cse_search_http_error', {
          status: response.status,
          query: query.query,
        });
        return [];
      }

      const data = (await response.json()) as GoogleCseApiResponse;
      const rawResults = Array.isArray(data.items) ? data.items : [];

      return rawResults.map((r) => ({
        url: r.link,
        title: r.title,
        snippet: r.snippet,
      }));
    } catch (err) {
      logger.warn('google_cse_search_exception', {
        error: errorMessage(err),
        query: query.query,
      });
      return [];
    }
  }
}
