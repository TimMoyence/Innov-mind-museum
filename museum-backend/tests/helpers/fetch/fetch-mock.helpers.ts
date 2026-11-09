export interface MockResponseInit {
  ok?: boolean;
  status?: number;
  body?: unknown;
  contentType?: string;
  headers?: Record<string, string | null>;
}

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

export function mockHtmlFetch(
  html: string,
  contentType?: string,
): jest.MockedFunction<typeof fetch> {
  return jest
    .fn<Promise<Response>, Parameters<typeof fetch>>()
    .mockResolvedValue(makeHtmlFetchResponse(html, contentType));
}

export function makeFetchSpy(): jest.MockedFunction<typeof fetch> {
  return jest.fn() as jest.MockedFunction<typeof fetch>;
}

function makeWebReadableStream(bytes: Uint8Array): {
  body: { getReader: () => { read: jest.Mock; cancel: jest.Mock; releaseLock: () => void } };
} {
  let consumed = false;
  const readSpy = jest.fn(async () => {
    if (consumed) return { done: true as const, value: undefined };
    consumed = true;
    return { done: false as const, value: bytes };
  });
  const cancelSpy = jest.fn(async () => undefined);
  return {
    body: {
      getReader: () => ({
        read: readSpy,
        cancel: cancelSpy,
        releaseLock: () => undefined,
      }),
    },
  };
}

export function makeHtmlFetchResponse(
  html: string,
  contentType = 'text/html; charset=utf-8',
): Response {
  const bytes = new TextEncoder().encode(html);
  const { body } = makeWebReadableStream(bytes);
  return {
    ok: true,
    status: 200,
    headers: {
      get: (key: string) => (key.toLowerCase() === 'content-type' ? contentType : null),
      has: (key: string) => key.toLowerCase() === 'content-type',
    },
    body,
    text: () => Promise.resolve(html),
    arrayBuffer: () => Promise.resolve(bytes.buffer.slice(0) as ArrayBuffer),
  } as unknown as Response;
}

export function makeRedirectFetchResponse(location: string, status = 302): Response {
  const { body } = makeWebReadableStream(new Uint8Array(0));
  return {
    ok: false,
    status,
    headers: {
      get: (key: string) => (key.toLowerCase() === 'location' ? location : null),
      has: (key: string) => key.toLowerCase() === 'location',
    },
    body,
    text: () => Promise.resolve(''),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
  } as unknown as Response;
}
