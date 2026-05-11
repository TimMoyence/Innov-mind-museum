/**
 * T2.5 — `url-head-probe.ts` (Citations v2 — URL reachability check).
 *
 * Spec:   `team-state/2026-05-11-c4-anti-hallucination/spec.md#R5`.
 * Design: `team-state/2026-05-11-c4-anti-hallucination/design.md#D5`.
 * Plan:   `docs/plans/2026-05-10-c4-launch-prompt.md` §F Step 2.5.
 *
 * Behavior under test (`UrlHeadProbe.probeBatch`):
 * - HEAD per URL with 800 ms timeout (`AbortSignal.timeout`).
 * - Parent signal honored via `AbortSignal.any` (Node ≥ 22).
 * - Result cached in Redis under `head-probe:v1:{sha256(url)[:16]}`, TTL 3600 s.
 * - HTTP 405 (some CDNs refuse HEAD) → retry GET with `Range: bytes=0-0`.
 * - Network errors (DNS, TCP reset, abort) → `reachable: false` (no throw).
 * - Empty input → empty Map.
 *
 * Sécurité (NFR — SSRF):
 * - Caller responsibility to filter URLs (only Wikidata / Brave / Wikimedia /
 *   museum-catalog reach the probe per spec §126). `UrlHeadProbe` itself does
 *   NOT enforce hostname allowlist — V2 hardening. Documented inline.
 */

import { createHash } from 'node:crypto';

import { UrlHeadProbe } from '@modules/chat/useCase/orchestration/url-head-probe';
import type { CacheService } from '@shared/cache/cache.port';

// Silence logger — we don't assert on log content here, only on probe results.
jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

/** Build the cache key the same way the production code does. */
function expectedKey(url: string): string {
  const sha = createHash('sha256').update(url).digest('hex').slice(0, 16);
  return `head-probe:v1:${sha}`;
}

/**
 * Minimal in-memory cache mirroring `CacheService` get/set semantics used by
 * the probe. Other methods throw — the probe must not call them.
 */
function makeFakeCache(): CacheService & { store: Map<string, unknown>; lastTtl: number | null } {
  const store = new Map<string, unknown>();
  let lastTtl: number | null = null;
  return {
    store,
    get lastTtl() {
      return lastTtl;
    },
    async get<T>(key: string): Promise<T | null> {
      return (store.has(key) ? (store.get(key) as T) : null);
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

/** Build a Response-shaped object from a status code, mimicking fetch's return. */
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
    expect(fetchFn).toHaveBeenCalledWith(
      url,
      expect.objectContaining({ method: 'HEAD' }),
    );
    // Wrote to Redis under the sha256[:16] key with 1 h TTL.
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
    // Negative results ARE cached too (we don't want to re-probe a dead link
    // every request — 1 h cache window is short enough per design D5).
    expect(cache.store.has(expectedKey(url))).toBe(true);
  });

  it('3. HEAD 405 → GET Range:bytes=0-0 fallback; reachable based on GET status', async () => {
    const cache = makeFakeCache();
    const url = 'https://cdn-strict.example.com/article';
    const fetchFn = jest
      .fn<Promise<Response>, Parameters<typeof fetch>>()
      .mockResolvedValueOnce(makeResp(405)) // HEAD → 405 Method Not Allowed
      .mockResolvedValueOnce(makeResp(206)); // GET Range → 206 Partial Content (reachable)

    const probe = new UrlHeadProbe({ cache, fetchFn });
    const result = await probe.probeBatch([url]);

    expect(result.get(url)).toEqual({ reachable: true, statusCode: 206, cached: false });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    // First call HEAD.
    expect(fetchFn).toHaveBeenNthCalledWith(
      1,
      url,
      expect.objectContaining({ method: 'HEAD' }),
    );
    // Second call GET with Range header.
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

    // MUST resolve, not throw.
    const result = await probe.probeBatch([url]);

    expect(result.get(url)).toEqual({ reachable: false, cached: false });
    // statusCode omitted when the request never produced a response.
    expect(result.get(url)?.statusCode).toBeUndefined();
  });

  it('5. cache hit (second call to same URL) → cached:true, fetch NOT invoked', async () => {
    const cache = makeFakeCache();
    const url = 'https://www.wikidata.org/wiki/Q12418';
    const fetchFn = jest
      .fn<Promise<Response>, Parameters<typeof fetch>>()
      .mockResolvedValue(makeResp(200));

    const probe = new UrlHeadProbe({ cache, fetchFn });

    // First call populates cache.
    await probe.probeBatch([url]);
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // Second call must hit the cache — no further fetch invocations.
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
    // Simulate the fetch rejecting with an AbortError because the parent
    // signal aborted. The probe MUST translate that to reachable:false
    // (graceful per design — empty Map on abort would be misleading).
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

    // Abort immediately — AbortSignal.any cascade should propagate to fetch.
    controller.abort();

    const result = await pending;
    expect(result.get(url)).toEqual({ reachable: false, cached: false });
  });

  it('8. timeout (slow upstream > timeoutMs) → reachable:false via AbortSignal.timeout', async () => {
    const cache = makeFakeCache();
    const url = 'https://slow.example.com';
    // Mimic Node's fetch: when its abort signal fires it rejects with a
    // DOMException-like error whose name is 'TimeoutError' or 'AbortError'.
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
    // Use a 50 ms timeout so the test doesn't wait the default 800 ms.
    const result = await probe.probeBatch([url], { timeoutMs: 50 });

    expect(result.get(url)).toEqual({ reachable: false, cached: false });
  });

  it('9. batch of 3 URLs (200, 404, cached-hit) → mixed result Map', async () => {
    const cache = makeFakeCache();
    const okUrl = 'https://example.com/ok';
    const koUrl = 'https://example.com/ko';
    const cachedUrl = 'https://example.com/already-known';

    // Pre-warm the cache for the third URL.
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
    // Only the two uncached URLs hit fetch.
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
