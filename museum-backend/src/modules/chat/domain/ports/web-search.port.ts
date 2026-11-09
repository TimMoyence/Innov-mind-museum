export interface SearchResult {
  url: string;
  title: string;
  snippet: string;
}

export interface WebSearchQuery {
  query: string;
  maxResults?: number;
  signal?: AbortSignal;
}

export interface WebSearchServiceConfig {
  timeoutMs: number;
  cacheTtlSeconds: number;
  maxResults: number;
}

export interface WebSearchProvider {
  readonly name?: string;
  search(query: WebSearchQuery): Promise<SearchResult[]>;
}

export class DisabledWebSearchProvider implements WebSearchProvider {
  search(): Promise<SearchResult[]> {
    return Promise.resolve([]);
  }
}
