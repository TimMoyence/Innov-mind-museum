import { logger } from '@shared/logger/logger';

import type {
  SearchResult,
  WebSearchProvider,
  WebSearchQuery,
} from '@modules/chat/domain/ports/web-search.port';

const DUCKDUCKGO_API_URL = 'https://api.duckduckgo.com/';
const HARD_RESULT_LIMIT = 10;

interface DuckDuckGoRelatedTopic {
  FirstURL?: string;
  Text?: string;
  Topics?: DuckDuckGoRelatedTopic[];
}

interface DuckDuckGoApiResponse {
  AbstractText?: string;
  AbstractURL?: string;
  Heading?: string;
  RelatedTopics?: DuckDuckGoRelatedTopic[];
}

/**
 * Parses AbstractText (top result) + flattens RelatedTopics (incl. nested Topic groups).
 * Never throws — any error returns empty array so caller can fail-open.
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
      skip_disambig: '1',
    });

    try {
      const response = await fetch(`${DUCKDUCKGO_API_URL}?${params.toString()}`, {
        method: 'GET',
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
      return this.parseResults(data, query.query, maxResults);
    } catch (err) {
      logger.warn('duckduckgo_search_exception', {
        error: err instanceof Error ? err.message : String(err),
        query: query.query,
      });
      return [];
    }
  }

  private parseResults(
    data: DuckDuckGoApiResponse,
    queryText: string,
    maxResults: number,
  ): SearchResult[] {
    const results: SearchResult[] = [];

    if (data.AbstractText && data.AbstractURL) {
      results.push({
        url: data.AbstractURL,
        title: data.Heading ?? queryText,
        snippet: data.AbstractText,
      });
    }

    const flatTopics = this.flattenTopics(data.RelatedTopics ?? []);

    for (const topic of flatTopics) {
      if (results.length >= maxResults) break;
      if (!topic.FirstURL || !topic.Text) continue;
      results.push(this.topicToResult(topic.FirstURL, topic.Text));
    }

    return results.slice(0, maxResults);
  }

  private topicToResult(firstURL: string, text: string): SearchResult {
    // Text format: "Title — description" or just plain text
    const separatorIndex = text.indexOf(' \u2014 ');
    const title = separatorIndex !== -1 ? text.slice(0, separatorIndex) : text;
    const snippet = separatorIndex !== -1 ? text.slice(separatorIndex + 3) : text;
    return { url: firstURL, title, snippet };
  }

  private flattenTopics(topics: DuckDuckGoRelatedTopic[]): DuckDuckGoRelatedTopic[] {
    const flat: DuckDuckGoRelatedTopic[] = [];
    for (const topic of topics) {
      if (topic.Topics) {
        flat.push(...this.flattenTopics(topic.Topics));
      } else {
        flat.push(topic);
      }
    }
    return flat;
  }
}
