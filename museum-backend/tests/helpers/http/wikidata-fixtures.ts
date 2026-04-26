/**
 * Shared fixtures for tests that touch the Wikidata clients.
 *
 * Per UFR-002 (DRY test factories): every Wikidata mock SHOULD compose these
 * builders rather than rolling its own response shape inline.
 */

/** Minimal `wbsearchentities` JSON body. */
export interface WbSearchHit {
  id: string;
  label: string;
  description?: string;
}

/** Minimal SPARQL JSON binding row — values are wrapped in `{value: string}`. */
export type SparqlBinding = Record<string, { value: string }>;

/**
 * Builds a `wbsearchentities` response body.
 * @param items - Search hits.
 * @returns A response body matching the `wbsearchentities` JSON shape.
 */
export function mockWbSearchResponse(items: WbSearchHit[]): { search: WbSearchHit[] } {
  return { search: items };
}

/**
 * Builds a SPARQL JSON results body.
 * @param bindings - One binding row per result.
 * @returns A response body matching the SPARQL JSON results shape.
 */
export function mockSparqlResponse(bindings: SparqlBinding[]): {
  results: { bindings: SparqlBinding[] };
} {
  return { results: { bindings } };
}

/**
 * Universal Wikidata response factory.
 *
 * Convenience wrapper that picks the shape based on `kind`. Useful when a test
 * mocks a sequence of fetches across both endpoints.
 * @param opts - Discriminated options matching the endpoint shape.
 * @returns The matching response body.
 */
export function mockWikidataResponse(
  opts: { kind: 'search'; items: WbSearchHit[] } | { kind: 'sparql'; bindings: SparqlBinding[] },
): unknown {
  if (opts.kind === 'search') return mockWbSearchResponse(opts.items);
  return mockSparqlResponse(opts.bindings);
}

/**
 * Wraps a JSON body in a Fetch-Response-shaped object compatible with
 * `jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(...)`.
 * @param body - JSON body.
 * @param ok - Defaults to `true` (HTTP 2xx).
 * @param status - Defaults to 200.
 * @returns A minimal Fetch-Response-shaped object suitable for `mockResolvedValueOnce`.
 */
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
