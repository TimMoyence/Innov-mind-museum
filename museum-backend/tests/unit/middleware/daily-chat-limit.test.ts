/**
 * UFR-022 red phase — PR-11 dailyChatLimit migration to createRateLimitMiddleware.
 * RUN_ID: 2026-05-23-pr-11-dailyChatLimit.
 *
 * Behavioural contract for the MIGRATED `dailyChatLimit` middleware. Pre-green:
 * this entire file FAILS because the current implementation:
 *   1. Imports `setDailyChatLimitCacheService` / `_resetDailyChatLimitCacheService`
 *      / `clearDailyChatLimitBuckets` — those exports will be deleted in green.
 *   2. Uses a non-atomic `cache.get` → `cache.set` pattern with `CacheService`,
 *      not the shared `RedisRateLimitStore.increment` Lua-atomic path.
 *   3. Does NOT set a `Retry-After` header on 429 (the shared factory does).
 *
 * Post-green: `dailyChatLimit` is a single `createRateLimitMiddleware({...})`
 * call. The Redis surface mocked here is `RedisRateLimitStore`, wired via
 * `setRedisRateLimitStore`. The atomic guarantee (R4) comes for free.
 *
 * Spec sources of truth:
 *   .claude/skills/team/team-state/2026-05-23-pr-11-dailyChatLimit/spec.md §4-§5
 *   .claude/skills/team/team-state/2026-05-23-pr-11-dailyChatLimit/design.md §3 / §5.2
 *
 * Frozen-test discipline (UFR-022): this file is sha256-hashed in
 * red-test-manifest.json. Green phase MUST NOT modify these tests. Suspected
 * bug → emit `BLOCK-TEST-WRONG <file>:<line> <reason>` and STOP.
 */
import type { Request, Response } from 'express';

import { dailyChatLimit } from '@shared/middleware/daily-chat-limit.middleware';
import {
  setRedisRateLimitStore,
  clearRateLimitBuckets,
  _resetRedisStore,
} from '@shared/middleware/rate-limit.middleware';
import type { RedisRateLimitStore } from '@shared/middleware/redis-rate-limit-store';
import { env } from '@src/config/env';
import { makePartialRequest } from '../../helpers/http/express-mock.helpers';

/** Flush microtask cycles — needed for the Redis path's promise chain. */
const flushAsync = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await new Promise(process.nextTick);
};

const makeMockReq = (overrides: Record<string, unknown> = {}): Request =>
  makePartialRequest({
    ip: '10.0.0.1',
    socket: { remoteAddress: '10.0.0.1' },
    ...overrides,
  });

type MockRes = Response & {
  status: jest.Mock;
  json: jest.Mock;
  setHeader: jest.Mock;
};
const makeMockRes = (): MockRes => {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
    end: jest.fn(),
    locals: {},
  };
  return res as unknown as MockRes;
};

const todayStr = (): string => new Date().toISOString().slice(0, 10);

/**
 * Factory for a RedisRateLimitStore mock that mimics atomic INCR semantics:
 * an internal per-key counter increments on each `increment(key, windowMs)`
 * call and returns `{ count, resetAt }`. Used to drive concurrency tests
 * (R4 / D3.b) where N parallel requests must result in `min(N, limit)`
 * allowed + `max(0, N - limit)` blocked.
 * @param initialCounters
 */
const makeAtomicMockRedisStore = (
  initialCounters: Record<string, number> = {},
): RedisRateLimitStore & { _counters: Map<string, number> } => {
  const counters = new Map<string, number>(Object.entries(initialCounters));
  return {
    increment: jest.fn(async (key: string, windowMs: number) => {
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      return { count: next, resetAt: Date.now() + windowMs };
    }),
    reset: jest.fn(async (key: string) => {
      counters.delete(key);
    }),
    clear: jest.fn(() => {
      counters.clear();
    }),
    stopSweep: jest.fn(),
    _counters: counters,
  } as unknown as RedisRateLimitStore & { _counters: Map<string, number> };
};

/** Mock that always rejects — drives fail-OPEN / fail-CLOSED branches. */
const makeFailingMockRedisStore = (): RedisRateLimitStore =>
  ({
    increment: jest.fn().mockRejectedValue(new Error('Redis connection refused')),
    reset: jest.fn(),
    clear: jest.fn(),
    stopSweep: jest.fn(),
  }) as unknown as RedisRateLimitStore;

/**
 * Pin `env.rateLimit.failClosed` for a single test, restore in afterEach.
 * Uses Object.defineProperty because `env.rateLimit` may be a frozen literal.
 * @param value
 * @param fn
 */
const withFailClosed = (value: boolean, fn: () => void | Promise<void>): void | Promise<void> => {
  const original = env.rateLimit.failClosed;
  Object.defineProperty(env.rateLimit, 'failClosed', {
    value,
    writable: true,
    configurable: true,
  });
  try {
    return fn();
  } finally {
    Object.defineProperty(env.rateLimit, 'failClosed', {
      value: original,
      writable: true,
      configurable: true,
    });
  }
};

// ---------------------------------------------------------------------------
// In-memory path (no Redis store wired) — anonymous skip + cap behaviour
// ---------------------------------------------------------------------------

describe('dailyChatLimit middleware — in-memory path (no Redis store wired)', () => {
  beforeEach(() => {
    clearRateLimitBuckets();
    _resetRedisStore();
    jest.clearAllMocks();
  });
  afterEach(() => {
    clearRateLimitBuckets();
    _resetRedisStore();
  });

  it('D1.a — authenticated user under cap → next() with no args', () => {
    const req = makeMockReq({ user: { id: 1 } });
    const res = makeMockRes();
    const next = jest.fn();

    dailyChatLimit(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(next).not.toHaveBeenCalledWith(expect.objectContaining({ statusCode: 429 }));
  });

  it('D1.b — authenticated user at cap → next(AppError) with DAILY_LIMIT_REACHED wire format', () => {
    const limit = Math.max(1, env.freeTierDailyChatLimit);
    const req = makeMockReq({ user: { id: 'cap-user' } });

    // Exhaust the limit.
    for (let i = 0; i < limit; i++) {
      const res = makeMockRes();
      const next = jest.fn();
      dailyChatLimit(req, res, next);
      expect(next).toHaveBeenCalledWith();
    }

    // The (limit+1)-th call must be blocked with the documented wire format.
    const res = makeMockRes();
    const next = jest.fn();
    dailyChatLimit(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 429,
        code: 'DAILY_LIMIT_REACHED',
        message: 'Daily chat limit reached',
        details: { limit },
      }),
    );
  });

  it('D1.c — day-boundary roll-over → counter resets on the next request', () => {
    const limit = Math.max(1, env.freeTierDailyChatLimit);
    const req = makeMockReq({ user: { id: 'rollover-user' } });

    for (let i = 0; i < limit; i++) {
      dailyChatLimit(req, makeMockRes(), jest.fn());
    }

    const blockedNext = jest.fn();
    dailyChatLimit(req, makeMockRes(), blockedNext);
    expect(blockedNext).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 429 }));

    // Jump to the next UTC day.
    jest.useFakeTimers();
    jest.setSystemTime(new Date(Date.now() + 25 * 60 * 60 * 1000));
    // Refresh the in-memory bucket store so day-keyed entries are not seen.
    clearRateLimitBuckets();

    const next = jest.fn();
    dailyChatLimit(req, makeMockRes(), next);
    expect(next).toHaveBeenCalledWith();
    expect(next).not.toHaveBeenCalledWith(expect.objectContaining({ statusCode: 429 }));

    jest.useRealTimers();
  });

  it('D1.d — anonymous request (no req.user) → next() skip, no error', () => {
    const req = makeMockReq();
    const res = makeMockRes();
    const next = jest.fn();

    dailyChatLimit(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });

  it('D1.e — user with empty id → next() skip, no error', () => {
    const req = makeMockReq({ user: {} });
    const res = makeMockRes();
    const next = jest.fn();

    dailyChatLimit(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });
});

// ---------------------------------------------------------------------------
// Redis distributed path — atomic increment + wire format + fail semantics
// ---------------------------------------------------------------------------

describe('dailyChatLimit middleware — Redis distributed path (atomic increment)', () => {
  beforeEach(() => {
    clearRateLimitBuckets();
    _resetRedisStore();
    jest.clearAllMocks();
  });
  afterEach(() => {
    clearRateLimitBuckets();
    _resetRedisStore();
  });

  it('D2.a — Redis path under cap → increment called with key `daily-chat:<id>:<UTC-date>` (no namespace prefix)', async () => {
    const store = makeAtomicMockRedisStore();
    setRedisRateLimitStore(store);

    const req = makeMockReq({ user: { id: 100 } });
    const res = makeMockRes();
    const next = jest.fn();

    dailyChatLimit(req, res, next);
    await flushAsync();

    // Spec §8 D1 + design §3.1 — key is `daily-chat:<id>:<UTC-date>` with no
    // namespace prefix (`bucketName: ''` opts out). The `ratelimit:` prefix is
    // added INSIDE `RedisRateLimitStore.increment`, so the mock spy sees the
    // unprefixed key as-emitted by the factory.
    expect(store.increment).toHaveBeenCalledWith(
      `daily-chat:100:${todayStr()}`,
      expect.any(Number),
    );
    expect(next).toHaveBeenCalledWith();
  });

  it('D2.b — Redis path at cap → AppError emitted with the documented wire format + Retry-After header', async () => {
    const limit = Math.max(1, env.freeTierDailyChatLimit);
    const store = {
      // Force a count > limit on the first call.
      increment: jest.fn().mockResolvedValue({ count: limit + 1, resetAt: Date.now() + 60_000 }),
      reset: jest.fn(),
      clear: jest.fn(),
      stopSweep: jest.fn(),
    } as unknown as RedisRateLimitStore;
    setRedisRateLimitStore(store);

    const req = makeMockReq({ user: { id: 200 } });
    const res = makeMockRes();
    const next = jest.fn();

    dailyChatLimit(req, res, next);
    await flushAsync();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 429,
        code: 'DAILY_LIMIT_REACHED',
        message: 'Daily chat limit reached',
        details: { limit },
      }),
    );
    // R5.2 — Retry-After header is set on cap (additive enrichment over the
    // legacy implementation, which did NOT set it).
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(String));
  });

  it('D2.c — Redis increment rejects → fail-OPEN to in-memory fallback when failClosed=false', async () => {
    setRedisRateLimitStore(makeFailingMockRedisStore());

    await withFailClosed(false, async () => {
      const req = makeMockReq({ user: { id: 400 } });
      const res = makeMockRes();
      const next = jest.fn();

      dailyChatLimit(req, res, next);
      await flushAsync();

      // Fall through to memory — request passes (under cap on a fresh bucket).
      expect(next).toHaveBeenCalledWith();
      expect(next).not.toHaveBeenCalledWith(expect.objectContaining({ statusCode: 429 }));
      expect(next).not.toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 503, code: 'RATE_LIMIT_UNAVAILABLE' }),
      );
    });
  });

  it('D2.d — Redis increment rejects → 503 RATE_LIMIT_UNAVAILABLE when failClosed=true', async () => {
    setRedisRateLimitStore(makeFailingMockRedisStore());

    await withFailClosed(true, async () => {
      const req = makeMockReq({ user: { id: 500 } });
      const res = makeMockRes();
      const next = jest.fn();

      dailyChatLimit(req, res, next);
      await flushAsync();

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 503,
          code: 'RATE_LIMIT_UNAVAILABLE',
        }),
      );
    });
  });

  it('D3.a — anonymous request → Redis store NEVER touched (R5.3)', async () => {
    const store = makeAtomicMockRedisStore();
    setRedisRateLimitStore(store);

    const req = makeMockReq(); // no user
    const res = makeMockRes();
    const next = jest.fn();

    dailyChatLimit(req, res, next);
    await flushAsync();

    expect(store.increment).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith();
  });

  it('D3.b — concurrent N=limit+5 requests → exactly `limit` allowed + 5 blocked (R4 atomic guarantee)', async () => {
    const limit = Math.max(1, env.freeTierDailyChatLimit);
    const N = limit + 5;

    const store = makeAtomicMockRedisStore();
    setRedisRateLimitStore(store);

    const userId = 'burst-user';

    // Fire N requests in parallel; collect each call's `next` result.
    const nextSpies: jest.Mock[] = [];
    const promises: Promise<void>[] = [];
    for (let i = 0; i < N; i++) {
      const req = makeMockReq({ user: { id: userId } });
      const res = makeMockRes();
      const next = jest.fn();
      nextSpies.push(next);
      dailyChatLimit(req, res, next);
      promises.push(Promise.resolve());
    }
    await Promise.all(promises);
    await flushAsync();

    let allowed = 0;
    let blocked = 0;
    for (const spy of nextSpies) {
      // Each `next` is called exactly once — either with no args (allowed) or
      // with an AppError of statusCode 429 (blocked).
      const calls = spy.mock.calls;
      expect(calls).toHaveLength(1);
      const arg = calls[0][0] as { statusCode?: number; code?: string } | undefined;
      if (arg === undefined) {
        allowed += 1;
      } else if (arg.statusCode === 429 && arg.code === 'DAILY_LIMIT_REACHED') {
        blocked += 1;
      }
    }

    expect(allowed).toBe(limit);
    expect(blocked).toBe(5);
  });

  it('D4 — windowMs passed to increment is between 1_000 and 86_400_000 (dynamic secondsUntilMidnightUtc bound)', async () => {
    const store = makeAtomicMockRedisStore();
    setRedisRateLimitStore(store);

    const req = makeMockReq({ user: { id: 'ttl-user' } });
    const res = makeMockRes();
    const next = jest.fn();

    dailyChatLimit(req, res, next);
    await flushAsync();

    expect(store.increment).toHaveBeenCalledTimes(1);
    const incrementMock = store.increment as unknown as jest.Mock;
    const [, windowMsArg] = incrementMock.mock.calls[0] as [string, number];
    expect(typeof windowMsArg).toBe('number');
    expect(windowMsArg).toBeGreaterThanOrEqual(1_000);
    expect(windowMsArg).toBeLessThanOrEqual(86_400_000);
  });
});
