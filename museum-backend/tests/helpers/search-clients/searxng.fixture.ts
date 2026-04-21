export interface SearxngApiHit {
  url: string;
  title: string;
  content: string;
}

export function makeSearxngHit(overrides: Partial<SearxngApiHit> = {}): SearxngApiHit {
  return {
    url: 'https://example.com/result',
    title: 'Example Result',
    content: 'Example snippet content',
    ...overrides,
  };
}

export function makeSearxngApiResponse(hits: SearxngApiHit[] = [makeSearxngHit()]): {
  results: SearxngApiHit[];
} {
  return { results: hits };
}
