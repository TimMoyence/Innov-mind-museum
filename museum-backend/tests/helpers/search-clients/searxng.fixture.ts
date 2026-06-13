export interface SearxngApiResult {
  url: string;
  title: string;
  content: string;
}

export function makeSearxngResult(overrides: Partial<SearxngApiResult> = {}): SearxngApiResult {
  return {
    url: 'https://example.com/result',
    title: 'Example Result',
    content: 'Example snippet content',
    ...overrides,
  };
}

export function makeSearxngApiResponse(results: SearxngApiResult[] = [makeSearxngResult()]): {
  results: SearxngApiResult[];
} {
  return { results };
}
