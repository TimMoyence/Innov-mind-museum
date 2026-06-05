/**
 * RUN_ID 2026-06-01-weak-net-idempotency — phase RED (UFR-022).
 *
 * W1-IDEM-01 — unit tests for the new idempotency dedup store (design §
 * "Architecture / BE store"). `remember(key, fn)`:
 *   - first call (miss)  → runs `fn` once, stores the result under a short TTL;
 *   - second call (hit)  → returns the STORED result WITHOUT re-running `fn`;
 *   - distinct keys      → `fn` runs once per key (no cross-key collision);
 *   - TTL expired        → the key is treated as new and `fn` runs again;
 *   - cache outage       → FAIL-OPEN: `fn` runs (the first send is NEVER
 *                          blocked), the store NEVER throws (spec R3).
 *
 * Modelled on `guardrail-friction.store.test.ts` (same in-process / redis
 * adapter split, same `InMemoryCacheService` stub, same DRY-fixture rule), but
 * the dedup store FAILS OPEN: a Redis outage must degrade to "treat as new"
 * (one extra create is acceptable; a 500 / a blocked first send is NOT).
 *
 * RED expectation: `@modules/chat/useCase/message/idempotency.store` does not
 * exist yet, so this file fails to compile/import → scoped run exits ≠ 0.
 *
 * Run scope: pnpm test -- --testPathPattern="idempotency"
 */
import { type CacheService } from '@shared/cache/cache.port';

import {
  __setIdempotencyStoreForTest,
  configureIdempotency,
  remember,
} from '@modules/chat/useCase/message/idempotency.store';

import { InMemoryCacheService } from '../../helpers/cache/inMemoryCacheService';

// Shared key fixtures (DRY — no inline literals, docs/TEST_FACTORIES.md).
const KEY_A = 'idem-key:user-42:sess-abc:k1';
const KEY_B = 'idem-key:user-42:sess-abc:k2';

interface StoredResult {
  status: number;
  body: { messageId: string };
}

const RESULT_ONE: StoredResult = { status: 201, body: { messageId: 'msg-1' } };
const RESULT_TWO: StoredResult = { status: 201, body: { messageId: 'msg-2' } };

describe('idempotency.store — remember() (in-memory cache backend)', () => {
  let cache: InMemoryCacheService;

  beforeEach(() => {
    cache = new InMemoryCacheService();
    __setIdempotencyStoreForTest(null);
    configureIdempotency({ cache });
  });

  afterEach(() => {
    __setIdempotencyStoreForTest(null);
  });

  it('runs the producer once on a miss and returns its result', async () => {
    const fn = jest.fn(async () => RESULT_ONE);

    const result = await remember(KEY_A, fn);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(result).toEqual(RESULT_ONE);
  });

  it('replays the stored result on the second call WITHOUT re-running the producer', async () => {
    const fn = jest
      .fn<Promise<StoredResult>, []>()
      .mockResolvedValueOnce(RESULT_ONE)
      .mockResolvedValueOnce(RESULT_TWO);

    const first = await remember(KEY_A, fn);
    const second = await remember(KEY_A, fn);

    // Producer ran exactly once across both calls; second call replayed.
    expect(fn).toHaveBeenCalledTimes(1);
    expect(first).toEqual(RESULT_ONE);
    expect(second).toEqual(RESULT_ONE);
  });

  it('runs the producer once per DISTINCT key (no cross-key collision)', async () => {
    const fnA = jest.fn(async () => RESULT_ONE);
    const fnB = jest.fn(async () => RESULT_TWO);

    const a = await remember(KEY_A, fnA);
    const b = await remember(KEY_B, fnB);

    expect(fnA).toHaveBeenCalledTimes(1);
    expect(fnB).toHaveBeenCalledTimes(1);
    expect(a).toEqual(RESULT_ONE);
    expect(b).toEqual(RESULT_TWO);
  });

  it('treats the key as new (re-runs the producer) once the stored result has TTL-expired', async () => {
    // First call stores the result. We then evict it from the cache to model
    // the short-TTL window having elapsed; the next call must re-run `fn`.
    const fn = jest
      .fn<Promise<StoredResult>, []>()
      .mockResolvedValueOnce(RESULT_ONE)
      .mockResolvedValueOnce(RESULT_TWO);

    const first = await remember(KEY_A, fn);
    expect(first).toEqual(RESULT_ONE);

    // Simulate TTL expiry by clearing every entry the store wrote for this key.
    cache.clear();

    const second = await remember(KEY_A, fn);

    expect(fn).toHaveBeenCalledTimes(2);
    expect(second).toEqual(RESULT_TWO);
  });
});

describe('idempotency.store — FAIL-OPEN on cache outage (spec R3)', () => {
  afterEach(() => {
    __setIdempotencyStoreForTest(null);
  });

  it('runs the producer (treats as new) when every cache op throws — never blocks the first send', async () => {
    const throwingCache = {
      get: async () => {
        throw new Error('ECONNREFUSED 127.0.0.1:6379');
      },
      set: async () => {
        throw new Error('ECONNREFUSED 127.0.0.1:6379');
      },
      del: async () => undefined,
      delByPrefix: async () => undefined,
      setNx: async () => {
        throw new Error('ECONNREFUSED 127.0.0.1:6379');
      },
      incrBy: async () => null,
      ping: async () => false,
      zadd: async () => undefined,
      ztop: async () => [],
    } as unknown as CacheService;
    configureIdempotency({ cache: throwingCache });

    const fn = jest.fn(async () => RESULT_ONE);

    const result = await remember(KEY_A, fn);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(result).toEqual(RESULT_ONE);
  });

  it('never throws out of remember() even when the producer succeeds but the store write fails', async () => {
    const writeFailCache = {
      get: async () => null,
      set: async () => {
        throw new Error('redis down on write');
      },
      del: async () => undefined,
      delByPrefix: async () => undefined,
      setNx: async () => true,
      incrBy: async () => null,
      ping: async () => false,
      zadd: async () => undefined,
      ztop: async () => [],
    } as unknown as CacheService;
    configureIdempotency({ cache: writeFailCache });

    const fn = jest.fn(async () => RESULT_ONE);

    await expect(remember(KEY_A, fn)).resolves.toEqual(RESULT_ONE);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('idempotency.store — in-process adapter null-result is a MISS (parity with Redis)', () => {
  beforeEach(() => {
    // No CacheService → in-process adapter (dev / test / single-instance).
    __setIdempotencyStoreForTest(null);
    configureIdempotency({});
  });

  afterEach(() => {
    __setIdempotencyStoreForTest(null);
  });

  it('re-runs the producer when the previously stored result was null (not a replay HIT)', async () => {
    // A producer that yielded null/non-2xx (e.g. a transient failure path) must
    // NOT be cached as a replay HIT: the in-process adapter must treat a stored
    // null as a MISS and re-run, exactly like the Redis adapter (stored !== null).
    const fn = jest
      .fn<Promise<StoredResult | null>, []>()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(RESULT_TWO);

    const first = await remember(KEY_A, fn);
    expect(first).toBeNull();

    const second = await remember(KEY_A, fn);

    expect(fn).toHaveBeenCalledTimes(2);
    expect(second).toEqual(RESULT_TWO);
  });

  it('re-runs the producer when the previously stored result was undefined (not a replay HIT)', async () => {
    const fn = jest
      .fn<Promise<StoredResult | undefined>, []>()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(RESULT_TWO);

    const first = await remember(KEY_A, fn);
    expect(first).toBeUndefined();

    const second = await remember(KEY_A, fn);

    expect(fn).toHaveBeenCalledTimes(2);
    expect(second).toEqual(RESULT_TWO);
  });
});
