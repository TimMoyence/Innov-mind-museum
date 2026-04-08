/** A single search result from a web search provider. */
export interface SearchResult {
  /** URL of the matching webpage. */
  url: string;
  /** Title of the result. */
  title: string;
  /** Snippet or excerpt from the page. */
  snippet: string;
}

/** Query input for web search. */
export interface WebSearchQuery {
  /** Search term. */
  query: string;
  /** Maximum results to return (capped at 10). */
  maxResults?: number;
}

/** Configuration for the web search service. */
export interface WebSearchServiceConfig {
  /** Timeout in milliseconds for search requests. */
  timeoutMs: number;
  /** Cache time-to-live in seconds. */
  cacheTtlSeconds: number;
  /** Max search results per query. */
  maxResults: number;
}

/** Port for web search providers (e.g., Tavily). */
export interface WebSearchProvider {
  /** Searches the web. Returns empty array if not found or on any error. */
  search(query: WebSearchQuery): Promise<SearchResult[]>;
}

/** Disabled stub that always returns empty array (fail-open). */
export class DisabledWebSearchProvider implements WebSearchProvider {
  /** Returns empty array — web search is disabled. */
  // eslint-disable-next-line @typescript-eslint/require-await
  async search(): Promise<SearchResult[]> {
    return [];
  }
}
