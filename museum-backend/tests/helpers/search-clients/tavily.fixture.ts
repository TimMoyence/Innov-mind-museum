export interface TavilyApiHit {
  url: string;
  title: string;
  content: string;
}

export function makeTavilyHit(overrides: Partial<TavilyApiHit> = {}): TavilyApiHit {
  return {
    url: 'https://example.com/result',
    title: 'Example Result',
    content: 'Example snippet content',
    ...overrides,
  };
}

export function makeTavilyApiResponse(hits: TavilyApiHit[] = [makeTavilyHit()]): {
  results: TavilyApiHit[];
} {
  return { results: hits };
}
