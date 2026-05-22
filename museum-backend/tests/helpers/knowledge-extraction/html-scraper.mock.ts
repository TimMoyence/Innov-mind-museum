import type {
  ScrapedPage,
  ScraperPort,
} from '@modules/knowledge-extraction/domain/ports/scraper.port';

/** Jest mock for HtmlScraper — avoids loading jsdom (ESM-only transitive deps) in unit tests. */
export class HtmlScraper implements ScraperPort {
  async scrape(_url: string): Promise<ScrapedPage | null> {
    return null;
  }
}

// ---------------------------------------------------------------------------
// C4 I-SEC10 (2026-05-21) — Streamed-body fetch response factory.
//
// Used by tests/unit/knowledge-extraction/html-scraper.test.ts to exercise
// the Content-Length pre-guard (spec R8) and the streamed cap (spec R9).
// Returns a partial `Response` whose `body` is a Web ReadableStream backed
// by either the supplied chunks or an empty chunk, plus a spy-able reader.
//
// Design notes (CLAUDE.md test discipline — no inline literals):
//
//  - `contentLength: null | undefined` → omitted from headers (absent).
//  - `contentLength: '<number>'` → set as `content-length` header value.
//  - `chunks?: Uint8Array[]` → enqueued by the ReadableStream's `pull`.
//                              Default = single empty chunk (closes immediately).
//  - `status` / `contentType` → default 200 / `text/html; charset=utf-8`.
//
// The factory exposes `readSpy` and `cancelSpy` properties on the returned
// Response so tests can assert the scraper streamed the body incrementally
// AND aborted at the cap (R9 reader.cancel() invariant).
// ---------------------------------------------------------------------------

export interface MockFetchResponseOpts {
  contentLength?: string | null;
  chunks?: Uint8Array[];
  status?: number;
  contentType?: string;
}

export interface MockFetchResponse extends Response {
  /** Spy on `body.getReader().read()` — tests assert call count <= ceil(cap/chunkSize)+1. */
  readSpy: jest.Mock;
  /** Spy on `body.getReader().cancel()` — tests assert called once on overflow. */
  cancelSpy: jest.Mock;
}

export function makeMockFetchResponse(opts: MockFetchResponseOpts = {}): MockFetchResponse {
  const status = opts.status ?? 200;
  const contentType = opts.contentType ?? 'text/html; charset=utf-8';
  const chunks = opts.chunks ?? [new Uint8Array(0)];
  const hasContentLength = opts.contentLength !== null && opts.contentLength !== undefined;

  const headerStore: Record<string, string> = { 'content-type': contentType };
  if (hasContentLength) {
    headerStore['content-length'] = String(opts.contentLength);
  }

  let chunkIdx = 0;
  const readSpy = jest.fn(async () => {
    if (chunkIdx >= chunks.length) {
      return { done: true as const, value: undefined };
    }
    const value = chunks[chunkIdx++];
    return { done: false as const, value };
  });
  const cancelSpy = jest.fn(async () => undefined);

  const reader = {
    read: readSpy,
    cancel: cancelSpy,
    releaseLock: () => undefined,
    closed: Promise.resolve(undefined),
  };

  const body = {
    getReader: () => reader,
  };

  const response = {
    ok: status >= 200 && status < 300,
    status,
    body,
    headers: {
      get: (key: string) => headerStore[key.toLowerCase()] ?? null,
      has: (key: string) => key.toLowerCase() in headerStore,
    },
    // text() preserved as a fallback so the helper survives any callsite that
    // still buffers (RED tests assert it is NOT called once the streaming
    // path lands — see html-scraper.test.ts I-SEC10 cases).
    text: async () => {
      const totalLen = chunks.reduce((sum, c) => sum + c.byteLength, 0);
      const merged = new Uint8Array(totalLen);
      let off = 0;
      for (const c of chunks) {
        merged.set(c, off);
        off += c.byteLength;
      }
      return new TextDecoder('utf-8').decode(merged);
    },
    arrayBuffer: async () => new ArrayBuffer(0),
    readSpy,
    cancelSpy,
  } as unknown as MockFetchResponse;

  return response;
}
