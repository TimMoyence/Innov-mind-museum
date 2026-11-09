import type {
  ScrapedPage,
  ScraperPort,
} from '@modules/knowledge-extraction/domain/ports/scraper.port';

export class HtmlScraper implements ScraperPort {
  async scrape(_url: string): Promise<ScrapedPage | null> {
    return null;
  }
}

export interface MockFetchResponseOpts {
  contentLength?: string | null;
  chunks?: Uint8Array[];
  status?: number;
  contentType?: string;
}

export interface MockFetchResponse extends Response {
  readSpy: jest.Mock;
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
