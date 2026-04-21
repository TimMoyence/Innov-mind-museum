/**
 * Typed fetch mock helpers.
 *
 * Replaces the `jest.fn()...as unknown as typeof fetch` pattern with
 * properly typed MockedFunction<typeof fetch>, eliminating double casts.
 *
 * Usage:
 *   global.fetch = mockFetch({ body: { results: [] } });
 *   global.fetch = mockFetch({ ok: false, status: 503 }, { body: data });
 *   global.fetch = mockFetch(new Error('network down'));
 */

export interface MockResponseInit {
  ok?: boolean;
  status?: number;
  body?: unknown;
  contentType?: string;
  headers?: Record<string, string | null>;
}

/** Builds a partial Response whose shape satisfies HTTP client code in tests. */
export function makePartialResponse(init: MockResponseInit = {}): Response {
  const ok = init.ok ?? true;
  const status = init.status ?? (ok ? 200 : 500);
  const contentType = init.contentType ?? 'application/json';
  const customHeaders = init.headers ?? {};
  return {
    ok,
    status,
    headers: {
      get: (key: string) =>
        customHeaders[key.toLowerCase()] ??
        (key.toLowerCase() === 'content-type' ? contentType : null),
      has: (key: string) =>
        key.toLowerCase() in customHeaders || key.toLowerCase() === 'content-type',
    },
    json: () => Promise.resolve(init.body ?? {}),
    text: () => Promise.resolve(JSON.stringify(init.body ?? {})),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
  } as unknown as Response;
}

type MockResponseOrError = MockResponseInit | Error;

/**
 * Returns a jest.MockedFunction<typeof fetch> that resolves or rejects
 * according to the supplied sequence.
 *
 * - Single entry → `mockResolvedValue` / `mockRejectedValue`
 * - Multiple entries → each queued via `mockResolvedValueOnce` / `mockRejectedValueOnce`
 */
export function mockFetch(
  first: MockResponseOrError,
  ...rest: MockResponseOrError[]
): jest.MockedFunction<typeof fetch> {
  const mock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();
  const all = [first, ...rest];
  if (all.length === 1) {
    const r = all[0]!;
    if (r instanceof Error) {
      mock.mockRejectedValue(r);
    } else {
      mock.mockResolvedValue(makePartialResponse(r));
    }
  } else {
    for (const r of all) {
      if (r instanceof Error) {
        mock.mockRejectedValueOnce(r);
      } else {
        mock.mockResolvedValueOnce(makePartialResponse(r));
      }
    }
  }
  return mock;
}

/**
 * Returns a jest.MockedFunction<typeof fetch> that always resolves with an HTML page response.
 * Eliminates the verbose `jest.fn().mockResolvedValue(makeHtmlFetchResponse(html)) as unknown as typeof fetch`
 * pattern in scraper tests.
 */
export function mockHtmlFetch(
  html: string,
  contentType?: string,
): jest.MockedFunction<typeof fetch> {
  return jest
    .fn<Promise<Response>, Parameters<typeof fetch>>()
    .mockResolvedValue(makeHtmlFetchResponse(html, contentType));
}

/**
 * Returns a bare jest.MockedFunction<typeof fetch> spy with no configured response.
 * Use when you only need to verify the spy was (or was not) called, or when you will
 * configure responses manually via .mockResolvedValueOnce() etc.
 */
export function makeFetchSpy(): jest.MockedFunction<typeof fetch> {
  return jest.fn() as jest.MockedFunction<typeof fetch>;
}

/** Builds an HTML page response — used in scraper tests. */
export function makeHtmlFetchResponse(
  html: string,
  contentType = 'text/html; charset=utf-8',
): Response {
  return {
    ok: true,
    status: 200,
    headers: {
      get: (key: string) => (key.toLowerCase() === 'content-type' ? contentType : null),
      has: (key: string) => key.toLowerCase() === 'content-type',
    },
    text: () => Promise.resolve(html),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
  } as unknown as Response;
}

/** Builds a 3xx redirect response carrying a Location header. */
export function makeRedirectFetchResponse(location: string, status = 302): Response {
  return {
    ok: false,
    status,
    headers: {
      get: (key: string) => (key.toLowerCase() === 'location' ? location : null),
      has: (key: string) => key.toLowerCase() === 'location',
    },
    text: () => Promise.resolve(''),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
  } as unknown as Response;
}
