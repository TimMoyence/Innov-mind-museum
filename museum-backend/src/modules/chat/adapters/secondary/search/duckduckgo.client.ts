import { logger } from '@shared/logger/logger';

import type {
  SearchResult,
  WebSearchProvider,
  WebSearchQuery,
} from '@modules/chat/domain/ports/web-search.port';

const DUCKDUCKGO_API_URL = 'https://api.duckduckgo.com/';
const HARD_RESULT_LIMIT = 10;

/** A leaf related topic carries a direct URL + text. */
interface DuckDuckGoRelatedTopic {
  FirstURL?: string;
  Text?: string;
}

/** A nested group has no FirstURL/Text of its own (skip it). */
interface DuckDuckGoApiResponse {
  Heading?: string;
  AbstractText?: string;
  AbstractURL?: string;
  RelatedTopics?: unknown[];
}

/**
 * DuckDuckGo Instant Answer API (`api.duckduckgo.com`). No API key required —
 * always-on free tail of the fallback chain. It returns an Abstract +
 * RelatedTopics rather than a full SERP, so normalization is best-effort:
 * emit the abstract (when present) plus each related topic that carries a
 * FirstURL + Text, skipping nested category groups. Never throws — any error
 * returns an empty array (fail-open).
 */
export class DuckDuckGoClient implements WebSearchProvider {
  readonly name = 'duckduckgo';

  async search(query: WebSearchQuery): Promise<SearchResult[]> {
    if (!query.query.trim()) return [];

    const maxResults = Math.min(query.maxResults ?? 5, HARD_RESULT_LIMIT);

    const params = new URLSearchParams({
      q: query.query,
      format: 'json',
      no_html: '1',
    });

    try {
      const response = await fetch(`${DUCKDUCKGO_API_URL}?${params.toString()}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: query.signal,
      });

      if (!response.ok) {
        logger.warn('duckduckgo_search_http_error', {
          status: response.status,
          query: query.query,
        });
        return [];
      }

      const data = (await response.json()) as DuckDuckGoApiResponse;
      const results: SearchResult[] = [];

      if (data.AbstractText && data.AbstractURL) {
        results.push({
          url: data.AbstractURL,
          title: data.Heading ?? data.AbstractText,
          snippet: data.AbstractText,
        });
      }

      const topics = Array.isArray(data.RelatedTopics) ? data.RelatedTopics : [];
      for (const entry of topics) {
        const topic = entry as DuckDuckGoRelatedTopic;
        if (topic.FirstURL && topic.Text) {
          results.push({
            url: topic.FirstURL,
            title: topic.Text,
            snippet: topic.Text,
          });
        }
      }

      return results.slice(0, maxResults);
    } catch (err) {
      logger.warn('duckduckgo_search_exception', {
        error: err instanceof Error ? err.message : String(err),
        query: query.query,
      });
      return [];
    }
  }
}
