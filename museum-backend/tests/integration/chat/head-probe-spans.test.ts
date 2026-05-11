/**
 * C4 Phase 7 T7.2 — Langfuse `chat.citations.head_probe` span emission.
 *
 * Asserts that `UrlHeadProbe.probeBatch()` opens a Langfuse trace named
 * `chat.citations.head_probe` via `safeTrace()`, carrying :
 *
 *   - `head_probe.url_count`           — number of URLs probed
 *   - `head_probe.cache_hit_rate`      — fraction in [0, 1]
 *   - `head_probe.unreachable_count`   — count of URLs that came back unreachable
 *
 * Empty input → NO trace (zero-I/O fast path is also zero-telemetry, avoids
 * polluting Langfuse with no-op spans).
 *
 * Plan : `docs/plans/2026-05-10-c4-launch-prompt.md` §K Step 7.2.
 *
 * Same module-mock pattern as `knowledge-spans.test.ts`.
 */

import { UrlHeadProbe } from '@modules/chat/useCase/orchestration/url-head-probe';

import type { CacheService } from '@shared/cache/cache.port';

jest.mock('@shared/observability/langfuse.client', () => ({
  getLangfuse: jest.fn(() => null),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports -- module-mock helper, identical pattern to similarity.service.test.ts
const { getLangfuse: mockGetLangfuse } = require('@shared/observability/langfuse.client') as {
  getLangfuse: jest.Mock;
};

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

interface CapturedTrace {
  name: string;
  metadata: Record<string, unknown>;
}

function makeFakeTraceClient(): { traces: CapturedTrace[]; client: { trace: jest.Mock } } {
  const traces: CapturedTrace[] = [];
  const client = {
    trace: jest.fn((args: { name: string; metadata?: Record<string, unknown> }) => {
      traces.push({ name: args.name, metadata: args.metadata ?? {} });
      return { update: jest.fn() };
    }),
  };
  return { traces, client };
}

function makeFakeCache(): CacheService & { store: Map<string, unknown> } {
  const store = new Map<string, unknown>();
  return {
    store,
    async get<T>(key: string): Promise<T | null> {
      return store.has(key) ? (store.get(key) as T) : null;
    },
    async set<T>(key: string, value: T): Promise<void> {
      store.set(key, value);
    },
    async del(key: string): Promise<void> {
      store.delete(key);
    },
    async delByPrefix(): Promise<void> {
      throw new Error('not used');
    },
    async setNx(): Promise<boolean> {
      throw new Error('not used');
    },
    async incrBy(): Promise<number | null> {
      throw new Error('not used');
    },
    async ping(): Promise<boolean> {
      return true;
    },
    async zadd(): Promise<void> {
      throw new Error('not used');
    },
    async ztop(): Promise<{ member: string; score: number }[]> {
      throw new Error('not used');
    },
  } as CacheService & { store: Map<string, unknown> };
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

describe('chat.citations.head_probe Langfuse span (T7.2)', () => {
  beforeEach(() => {
    mockGetLangfuse.mockReset();
  });

  it('emits one trace named "chat.citations.head_probe" per probeBatch call', async () => {
    const { traces, client } = makeFakeTraceClient();
    mockGetLangfuse.mockReturnValue(client);

    const cache = makeFakeCache();
    const fetchFn = jest.fn(async () => makeResp(200));
    const probe = new UrlHeadProbe({ cache, fetchFn: fetchFn as unknown as typeof fetch });

    await probe.probeBatch(['https://example.org/a', 'https://example.org/b']);

    expect(client.trace).toHaveBeenCalledTimes(1);
    expect(traces[0].name).toBe('chat.citations.head_probe');
  });

  it('carries head_probe.url_count + cache_hit_rate + unreachable_count', async () => {
    const { traces, client } = makeFakeTraceClient();
    mockGetLangfuse.mockReturnValue(client);

    // Pre-seed cache for one URL → one cache-hit, one network call.
    const cache = makeFakeCache();
    const urlA = 'https://example.org/a';
    const urlB = 'https://example.org/b';
    // Compute the key with the same SHA scheme.
    const { createHash } = await import('node:crypto');
    const keyA = `head-probe:v1:${createHash('sha256').update(urlA).digest('hex').slice(0, 16)}`;
    cache.store.set(keyA, { reachable: true, statusCode: 200 });

    const fetchFn = jest.fn(async () => makeResp(404));
    const probe = new UrlHeadProbe({ cache, fetchFn: fetchFn as unknown as typeof fetch });

    await probe.probeBatch([urlA, urlB]);

    const md = traces[0].metadata;
    expect(md['head_probe.url_count']).toBe(2);
    expect(md['head_probe.cache_hit_rate']).toBe(0.5);
    // Cache-hit was reachable=true ; the 404 from fetch comes back unreachable.
    expect(md['head_probe.unreachable_count']).toBe(1);
  });

  it('reports cache_hit_rate=0 when no URLs are cached', async () => {
    const { traces, client } = makeFakeTraceClient();
    mockGetLangfuse.mockReturnValue(client);

    const cache = makeFakeCache();
    const fetchFn = jest.fn(async () => makeResp(200));
    const probe = new UrlHeadProbe({ cache, fetchFn: fetchFn as unknown as typeof fetch });

    await probe.probeBatch(['https://example.org/x', 'https://example.org/y']);

    const md = traces[0].metadata;
    expect(md['head_probe.url_count']).toBe(2);
    expect(md['head_probe.cache_hit_rate']).toBe(0);
    expect(md['head_probe.unreachable_count']).toBe(0);
  });

  it('empty URL list → no trace (zero-I/O fast path)', async () => {
    const { client } = makeFakeTraceClient();
    mockGetLangfuse.mockReturnValue(client);

    const cache = makeFakeCache();
    const probe = new UrlHeadProbe({ cache });

    const out = await probe.probeBatch([]);

    expect(out.size).toBe(0);
    expect(client.trace).not.toHaveBeenCalled();
  });

  it('fail-open: a Langfuse throw does NOT break probeBatch()', async () => {
    const client = {
      trace: jest.fn(() => {
        throw new Error('langfuse down');
      }),
    };
    mockGetLangfuse.mockReturnValue(client);

    const cache = makeFakeCache();
    const fetchFn = jest.fn(async () => makeResp(200));
    const probe = new UrlHeadProbe({ cache, fetchFn: fetchFn as unknown as typeof fetch });

    const out = await probe.probeBatch(['https://example.org/a']);
    expect(out.get('https://example.org/a')?.reachable).toBe(true);
  });
});
