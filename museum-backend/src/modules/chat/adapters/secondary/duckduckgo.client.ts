import { logger } from '@shared/logger/logger';

import type {
  SearchResult,
  WebSearchProvider,
  WebSearchQuery,
} from '../../domain/ports/web-search.port';

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
 * DuckDuckGo Instant Answer API adapter implementing {@link WebSearchProvider}.
 *
 * Parses the AbstractText (if present) as a top result, then expands
 * RelatedTopics (including nested Topic groups) for additional results.
 * Uses native `fetch` (Node 18+). Never throws from public methods —
 * any error returns an empty array so the caller can fail-open.
 */
export class DuckDuckGoClient implements WebSearchProvider {
  readonly name = 'duckduckgo';

  /**
   * Searches the web via DuckDuckGo Instant Answer API.
   *
   * @param query - Search term and max results.
   * @returns Search results, or empty array on any failure.
   */
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

  /** Assembles SearchResult[] from a raw DDG Instant Answer response. */
  private parseResults(
    data: DuckDuckGoApiResponse,
    queryText: string,
    maxResults: number,
  ): SearchResult[] {
    const results: SearchResult[] = [];

    // Abstract result (the main instant answer)
    if (data.AbstractText && data.AbstractURL) {
      results.push({
        url: data.AbstractURL,
        title: data.Heading ?? queryText,
        snippet: data.AbstractText,
      });
    }

    // Related topics — flatten nested Topic groups
    const flatTopics = this.flattenTopics(data.RelatedTopics ?? []);

    for (const topic of flatTopics) {
      if (results.length >= maxResults) break;
      if (!topic.FirstURL || !topic.Text) continue;
      results.push(this.topicToResult(topic.FirstURL, topic.Text));
    }

    return results.slice(0, maxResults);
  }

  /** Converts a single RelatedTopic entry into a SearchResult. */
  private topicToResult(firstURL: string, text: string): SearchResult {
    // Text format: "Title — description" or just plain text
    const separatorIndex = text.indexOf(' \u2014 ');
    const title = separatorIndex !== -1 ? text.slice(0, separatorIndex) : text;
    const snippet = separatorIndex !== -1 ? text.slice(separatorIndex + 3) : text;
    return { url: firstURL, title, snippet };
  }

  /** Recursively flattens nested RelatedTopics groups into a flat array. */
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
