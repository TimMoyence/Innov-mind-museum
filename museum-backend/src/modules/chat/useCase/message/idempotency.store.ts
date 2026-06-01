/**
 * Idempotency dedup store (2026-06-01, RUN_ID weak-net-idempotency, D2).
 *
 * `remember(key, fn)` collapses a replayed `POST /messages` (same
 * `Idempotency-Key`) into a single create:
 *   - miss  → reserve the key via `setNx`, run `fn` once, store the SERIALIZED
 *     result under `idempotency:result:<key>` with a short TTL
 *     (`IDEMPOTENCY_TTL_MS`), and return it;
 *   - hit   → return the STORED result WITHOUT re-running `fn`;
 *   - TTL expired → the key reads as new and `fn` runs again.
 *
 * Modelled on `guardrail-friction.store.ts` (same in-process / Redis-via-
 * CacheService adapter split, same `__setIdempotencyStoreForTest` /
 * `__setNowForTest` seams). FAIL POLICY = **FAIL-OPEN** (inverse of the budget
 * store's fail-closed): a cache outage MUST degrade to "treat as new" — `fn`
 * runs, `remember` NEVER throws and NEVER blocks the first send. One extra
 * create on a Redis outage is acceptable; a 500 / a blocked first send is not.
 *
 * lib-docs/ioredis/PATTERNS.md §3.3 (RedisCacheService fail-soft: every op in
 * try/catch, never bubbles to the request path) + LESSONS.md 2026-05-18
 * (fail-soft cache). We consume the `CacheService` abstraction only — no raw
 * ioredis client instantiated here (PATTERNS §4 DON'T module-load client).
 *
 * Backend selection is read DYNAMICALLY from `GUARDRAIL_FRICTION_BACKEND`-style
 * gating via the injected CacheService: if a CacheService is configured we use
 * the Redis-backed adapter, otherwise the in-process adapter (dev / test /
 * single-instance / CACHE_ENABLED=false).
 */
import { logger } from '@shared/logger/logger';
import { env } from '@src/config/env';

import type { CacheService } from '@shared/cache/cache.port';

/** Port consumed by the public functional API. Both adapters implement it. */
export interface IIdempotencyStore {
  /**
   * Returns the stored result for `key` (hit) WITHOUT running `producer`, or
   * runs `producer` once (miss / TTL-expired / cache outage) and stores its
   * result (an opaque, serializable HTTP outcome). FAIL-OPEN: never throws,
   * never blocks the first producer run.
   */
  remember<T>(key: string, producer: () => Promise<T>): Promise<T>;
}

// Test seam — overrideable clock (parity with guardrail-friction.store). The
// in-process adapter keys TTL expiry on it; the Redis adapter delegates TTL to
// the cache backend.
let nowProvider: () => Date = () => new Date();

const RESULT_PREFIX = 'idempotency:result:';
const RESERVE_PREFIX = 'idempotency:reserve:';

const resultKey = (key: string): string => `${RESULT_PREFIX}${key}`;
const reserveKey = (key: string): string => `${RESERVE_PREFIX}${key}`;

const ttlMs = (): number => env.idempotencyTtlMs;
const ttlSec = (): number => Math.max(1, Math.floor(ttlMs() / 1000));

/** In-process adapter — per-process Map. Dev / test / single-instance. */
class InProcessIdempotencyStore implements IIdempotencyStore {
  private readonly results = new Map<string, { value: unknown; expiresAt: number }>();

  async remember<T>(key: string, producer: () => Promise<T>): Promise<T> {
    const k = resultKey(key);
    const existing = this.results.get(k);
    // Mirror the Redis adapter's `stored !== null` MISS semantics: a stored
    // `null`/`undefined` (e.g. a producer that yielded a non-2xx / transient
    // failure) is NOT a replay HIT — re-run the producer instead of returning
    // the empty value, which would otherwise short-circuit and could hang the
    // caller waiting on a result that never re-runs.
    if (
      existing &&
      nowProvider().getTime() <= existing.expiresAt &&
      existing.value !== null &&
      existing.value !== undefined
    ) {
      return existing.value as T;
    }
    if (existing) this.results.delete(k);

    const value = await producer();
    this.results.set(k, { value, expiresAt: nowProvider().getTime() + ttlMs() });
    return value;
  }
}

/**
 * Redis adapter — CacheService get/setNx/set for cross-instance dedup.
 *
 * FAIL-OPEN policy:
 *   - a `get` throw → treat as miss → run the producer (one extra create is
 *     acceptable, the first send is never blocked);
 *   - a `setNx` / `set` throw → swallow (metric-free warn) → still return the
 *     producer result. A write outage must never surface as a 500 nor block.
 */
class RedisIdempotencyStore implements IIdempotencyStore {
  constructor(private readonly cache: CacheService) {}

  private onFallback(op: string, error: unknown): void {
    logger.warn('idempotency_redis_fail_open', {
      op,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  async remember<T>(key: string, producer: () => Promise<T>): Promise<T> {
    try {
      const stored = await this.cache.get<T>(resultKey(key));
      if (stored !== null) return stored;
    } catch (error) {
      this.onFallback('get', error);
    }

    // Reserve the key so a concurrent replay does not double-run the producer.
    // A failed reserve (outage OR lost race) is non-fatal — FAIL-OPEN means we
    // still run the producer; the worst case is one extra create.
    try {
      await this.cache.setNx(reserveKey(key), 1, ttlSec());
    } catch (error) {
      this.onFallback('setNx', error);
    }

    const value = await producer();

    try {
      await this.cache.set(resultKey(key), value, ttlSec());
    } catch (error) {
      this.onFallback('set', error);
    }

    return value;
  }
}

let store: IIdempotencyStore | null = null;

/**
 * Wires the chosen backend at composition time (chat module boot) OR per-test.
 * A CacheService present → Redis-backed adapter; absent → in-process adapter
 * (a misconfigured CACHE_ENABLED=false deployment must not deadlock dedup).
 */
export function configureIdempotency(deps: { cache?: CacheService }): void {
  store = deps.cache ? new RedisIdempotencyStore(deps.cache) : new InProcessIdempotencyStore();
}

function ensureStore(): IIdempotencyStore {
  // Defensive default — the composition root SHOULD have called
  // `configureIdempotency` already. In-process keeps tests that import the
  // module without explicit configuration working.
  store ??= new InProcessIdempotencyStore();
  return store;
}

/**
 * Replays the stored result for `key` (hit) or runs `producer` once (miss).
 * FAIL-OPEN: never throws out of here, never blocks the first send.
 */
export const remember = async <T>(key: string, producer: () => Promise<T>): Promise<T> => {
  return await ensureStore().remember(key, producer);
};

/**
 * Test-only seam: override the internal clock used for in-process TTL expiry.
 * Pass `undefined` to restore the real clock. Never call from production code.
 */
export const __setNowForTest = (date: Date | undefined): void => {
  nowProvider = date ? () => date : () => new Date();
};

/**
 * Test-only seam: inject a custom store directly (or `null` to force the next
 * call to rebuild from `configureIdempotency` / the in-process default).
 */
export const __setIdempotencyStoreForTest = (next: IIdempotencyStore | null): void => {
  store = next;
};
