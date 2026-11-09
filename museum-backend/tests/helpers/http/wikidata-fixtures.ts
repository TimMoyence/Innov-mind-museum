export interface WbSearchHit {
  id: string;
  label: string;
  description?: string;
}

export type SparqlBinding = Record<string, { value: string }>;

export function mockWbSearchResponse(items: WbSearchHit[]): { search: WbSearchHit[] } {
  return { search: items };
}

export function mockSparqlResponse(bindings: SparqlBinding[]): {
  results: { bindings: SparqlBinding[] };
} {
  return { results: { bindings } };
}

export function mockWikidataResponse(
  opts: { kind: 'search'; items: WbSearchHit[] } | { kind: 'sparql'; bindings: SparqlBinding[] },
): unknown {
  if (opts.kind === 'search') return mockWbSearchResponse(opts.items);
  return mockSparqlResponse(opts.bindings);
}

export function asFetchResponse(
  body: unknown,
  ok = true,
  status = 200,
): { ok: boolean; status: number; json: () => Promise<unknown> } {
  return {
    ok,
    status,
    json: async () => body,
  };
}
