export interface SearchResult {
  url: string;
  title: string;
  snippet: string;
}

export interface WebSearchQuery {
  query: string;
  /** Capped at 10. */
  maxResults?: number;
  /** So callers can cancel in-flight when their timeout fires. */
  signal?: AbortSignal;
}

export interface WebSearchServiceConfig {
  timeoutMs: number;
  cacheTtlSeconds: number;
  maxResults: number;
}

export interface WebSearchProvider {
  readonly name?: string;
  /** Returns empty array if not found or on any error. */
  search(query: WebSearchQuery): Promise<SearchResult[]>;
}

/** Fail-open. */
export class DisabledWebSearchProvider implements WebSearchProvider {
  // eslint-disable-next-line @typescript-eslint/require-await -- null-object pattern: interface requires async signature
  async search(): Promise<SearchResult[]> {
    return [];
  }
}
