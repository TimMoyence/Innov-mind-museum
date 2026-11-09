import { createHash } from 'node:crypto';

import { UrlHeadProbe } from '@modules/chat/useCase/orchestration/url-head-probe';
import type { CacheService } from '@shared/cache/cache.port';

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

function expectedKey(url: string): string {
  const sha = createHash('sha256').update(url).digest('hex').slice(0, 16);
  return `head-probe:v1:${sha}`;
}

function makeFakeCache(): CacheService & { store: Map<string, unknown>; lastTtl: number | null } {
  const store = new Map<string, unknown>();
  let lastTtl: number | null = null;
  return {
    store,
    get lastTtl() {
      return lastTtl;
    },
    async get<T>(key: string): Promise<T | null> {
      return store.has(key) ? (store.get(key) as T) : null;
    },
    async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
      store.set(key, value);
      lastTtl = ttlSeconds ?? null;
    },
    async del(key: string): Promise<void> {
      store.delete(key);
    },
    async delByPrefix(): Promise<void> {
      throw new Error('not used by url-head-probe');
    },
    async setNx(): Promise<boolean> {
      throw new Error('not used by url-head-probe');
    },
    async incrBy(): Promise<number | null> {
      throw new Error('not used by url-head-probe');
    },
    async ping(): Promise<boolean> {
      return true;
    },
    async zadd(): Promise<void> {
      throw new Error('not used by url-head-probe');
    },
    async ztop(): Promise<{ member: string; score: number }[]> {
      throw new Error('not used by url-head-probe');
    },
  } as CacheService & { store: Map<string, unknown>; lastTtl: number | null };
}

function makeResp(status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: () => null,
      has: () => false,
    },
  } as unknown as Response;
}

describe('UrlHeadProbe — probeBatch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('1. HEAD 200 → reachable:true, cached:false (first call); writes Redis with TTL 3600', async () => {
    const cache = makeFakeCache();
    const url = 'https://www.wikidata.org/wiki/Q12418';
    const fetchFn = jest
      .fn<Promise<Response>, Parameters<typeof fetch>>()
      .mockResolvedValue(makeResp(200));

    const probe = new UrlHeadProbe({ cache, fetchFn });
    const result = await probe.probeBatch([url]);

    expect(result.size).toBe(1);
    expect(result.get(url)).toEqual({ reachable: true, statusCode: 200, cached: false });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledWith(url, expect.objectContaining({ method: 'HEAD' }));
    expect(cache.store.has(expectedKey(url))).toBe(true);
    expect(cache.lastTtl).toBe(3600);
  });

  it('2. HEAD 404 → reachable:false, statusCode:404, cached:false', async () => {
    const cache = makeFakeCache();
    const url = 'https://example.org/missing';
    const fetchFn = jest
      .fn<Promise<Response>, Parameters<typeof fetch>>()
      .mockResolvedValue(makeResp(404));

    const probe = new UrlHeadProbe({ cache, fetchFn });
    const result = await probe.probeBatch([url]);

    expect(result.get(url)).toEqual({ reachable: false, statusCode: 404, cached: false });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(cache.store.has(expectedKey(url))).toBe(true);
  });

  it('3. HEAD 405 → GET Range:bytes=0-0 fallback; reachable based on GET status', async () => {
    const cache = makeFakeCache();
    const url = 'https://cdn-strict.example.com/article';
    const fetchFn = jest
      .fn<Promise<Response>, Parameters<typeof fetch>>()
      .mockResolvedValueOnce(makeResp(405))
      .mockResolvedValueOnce(makeResp(206));

    const probe = new UrlHeadProbe({ cache, fetchFn });
    const result = await probe.probeBatch([url]);

    expect(result.get(url)).toEqual({ reachable: true, statusCode: 206, cached: false });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(fetchFn).toHaveBeenNthCalledWith(1, url, expect.objectContaining({ method: 'HEAD' }));
    const secondCallInit = fetchFn.mock.calls[1][1] as RequestInit;
    expect(secondCallInit.method).toBe('GET');
    const headers = secondCallInit.headers as Record<string, string>;
    expect(headers.Range).toBe('bytes=0-0');
  });

  it('4. HEAD network error (DNS / TCP reset) → reachable:false (graceful, no throw)', async () => {
    const cache = makeFakeCache();
    const url = 'https://does-not-resolve.invalid';
    const fetchFn = jest
      .fn<Promise<Response>, Parameters<typeof fetch>>()
      .mockRejectedValue(new TypeError('fetch failed: ENOTFOUND'));

    const probe = new UrlHeadProbe({ cache, fetchFn });

    const result = await probe.probeBatch([url]);

    expect(result.get(url)).toEqual({ reachable: false, cached: false });
    expect(result.get(url)?.statusCode).toBeUndefined();
  });

  it('5. cache hit (second call to same URL) → cached:true, fetch NOT invoked', async () => {
    const cache = makeFakeCache();
    const url = 'https://www.wikidata.org/wiki/Q12418';
    const fetchFn = jest
      .fn<Promise<Response>, Parameters<typeof fetch>>()
      .mockResolvedValue(makeResp(200));

    const probe = new UrlHeadProbe({ cache, fetchFn });

    await probe.probeBatch([url]);
    expect(fetchFn).toHaveBeenCalledTimes(1);

    const second = await probe.probeBatch([url]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(second.get(url)).toEqual({ reachable: true, statusCode: 200, cached: true });
  });

  it('6. empty url list → empty Map (no fetch, no cache I/O)', async () => {
    const cache = makeFakeCache();
    const fetchFn = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

    const probe = new UrlHeadProbe({ cache, fetchFn });
    const result = await probe.probeBatch([]);

    expect(result.size).toBe(0);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(cache.store.size).toBe(0);
  });

  it('7. parent signal aborted upstream → reachable:false (cascades via AbortSignal.any, no throw)', async () => {
    const cache = makeFakeCache();
    const url = 'https://www.wikidata.org/wiki/Q1';
    const fetchFn = jest
      .fn<Promise<Response>, Parameters<typeof fetch>>()
      .mockImplementation((_url, init) => {
        const signal = (init as RequestInit | undefined)?.signal;
        return new Promise((_, reject) => {
          const onAbort = (): void => {
            const err = new Error('aborted') as Error & { name: string };
            err.name = 'AbortError';
            reject(err);
          };
          if (signal?.aborted) onAbort();
          else signal?.addEventListener('abort', onAbort, { once: true });
        });
      });

    const controller = new AbortController();
    const probe = new UrlHeadProbe({ cache, fetchFn });
    const pending = probe.probeBatch([url], { signal: controller.signal });

    controller.abort();

    const result = await pending;
    expect(result.get(url)).toEqual({ reachable: false, cached: false });
  });

  it('8. timeout (slow upstream > timeoutMs) → reachable:false via AbortSignal.timeout', async () => {
    const cache = makeFakeCache();
    const url = 'https://slow.example.com';
    const fetchFn = jest
      .fn<Promise<Response>, Parameters<typeof fetch>>()
      .mockImplementation((_url, init) => {
        const signal = (init as RequestInit | undefined)?.signal;
        return new Promise((_, reject) => {
          const onAbort = (): void => {
            const err = new Error('timeout') as Error & { name: string };
            err.name = 'TimeoutError';
            reject(err);
          };
          if (signal?.aborted) onAbort();
          else signal?.addEventListener('abort', onAbort, { once: true });
        });
      });

    const probe = new UrlHeadProbe({ cache, fetchFn });
    const result = await probe.probeBatch([url], { timeoutMs: 50 });

    expect(result.get(url)).toEqual({ reachable: false, cached: false });
  });

  it('9. batch of 3 URLs (200, 404, cached-hit) → mixed result Map', async () => {
    const cache = makeFakeCache();
    const okUrl = 'https://example.com/ok';
    const koUrl = 'https://example.com/ko';
    const cachedUrl = 'https://example.com/already-known';

    await cache.set(expectedKey(cachedUrl), { reachable: true, statusCode: 200 }, 3600);

    const fetchFn = jest
      .fn<Promise<Response>, Parameters<typeof fetch>>()
      .mockImplementation((u) => {
        const url = String(u);
        if (url === okUrl) return Promise.resolve(makeResp(200));
        if (url === koUrl) return Promise.resolve(makeResp(404));
        return Promise.reject(new Error('unexpected fetch'));
      });

    const probe = new UrlHeadProbe({ cache, fetchFn });
    const result = await probe.probeBatch([okUrl, koUrl, cachedUrl]);

    expect(result.size).toBe(3);
    expect(result.get(okUrl)).toEqual({ reachable: true, statusCode: 200, cached: false });
    expect(result.get(koUrl)).toEqual({ reachable: false, statusCode: 404, cached: false });
    expect(result.get(cachedUrl)).toEqual({ reachable: true, statusCode: 200, cached: true });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('10. User-Agent header sent for HEAD (good-citizen probe identification)', async () => {
    const cache = makeFakeCache();
    const url = 'https://example.org/uat';
    const fetchFn = jest
      .fn<Promise<Response>, Parameters<typeof fetch>>()
      .mockResolvedValue(makeResp(200));

    const probe = new UrlHeadProbe({ cache, fetchFn });
    await probe.probeBatch([url]);

    const init = fetchFn.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['User-Agent']).toMatch(/Musaium-CitationProbe/);
  });
});
