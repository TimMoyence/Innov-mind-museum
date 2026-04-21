export interface BraveApiHit {
  url: string;
  title: string;
  description: string;
}

export function makeBraveHit(overrides: Partial<BraveApiHit> = {}): BraveApiHit {
  return {
    url: 'https://example.com/result',
    title: 'Example Result',
    description: 'Example snippet content',
    ...overrides,
  };
}

export function makeBraveApiResponse(hits: BraveApiHit[] = [makeBraveHit()]): {
  web: { results: BraveApiHit[] };
} {
  return { web: { results: hits } };
}
