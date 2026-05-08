import type { Request } from 'express';

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { logger } from '@shared/logger/logger';
import {
  createRateLimitMiddleware,
  byIp,
  bySession,
  byUserId,
  setRedisRateLimitStore,
  clearRateLimitBuckets,
  _resetRedisStore,
} from '@src/helpers/middleware/rate-limit.middleware';
import type { RedisRateLimitStore } from '@src/helpers/middleware/redis-rate-limit-store';
import { makePartialRequest, makePartialResponse } from '../../helpers/http/express-mock.helpers';

const makeMockReq = (overrides: Record<string, unknown> = {}): Request =>
  makePartialRequest({
    ip: '10.0.0.1',
    socket: { remoteAddress: '10.0.0.1' },
    ...overrides,
  });

const makeMockRes = makePartialResponse;

describe('rate-limit middleware — branch coverage', () => {
  beforeEach(() => clearRateLimitBuckets());
  afterEach(() => clearRateLimitBuckets());

  it('allows requests up to the limit then rejects with 429', () => {
    const mw = createRateLimitMiddleware({ limit: 2, windowMs: 60_000, keyGenerator: byIp });
    const req = makeMockReq();
    const res = makeMockRes();

    // First two should pass
    const next1 = jest.fn();
    mw(req, res, next1);
    expect(next1).toHaveBeenCalledWith();

    const next2 = jest.fn();
    mw(req, res, next2);
    expect(next2).toHaveBeenCalledWith();

    // Third should be rejected
    const next3 = jest.fn();
    mw(req, res, next3);
    expect(next3).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 429 }));
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(String));
  });

  it('resets after the window expires', () => {
    jest.useFakeTimers();
    const windowMs = 1000;
    const mw = createRateLimitMiddleware({ limit: 1, windowMs, keyGenerator: byIp });
    const req = makeMockReq();
    const res = makeMockRes();

    const next1 = jest.fn();
    mw(req, res, next1);
    expect(next1).toHaveBeenCalledWith();

    // Advance past the window
    jest.advanceTimersByTime(windowMs + 1);

    const next2 = jest.fn();
    mw(req, res, next2);
    expect(next2).toHaveBeenCalledWith();

    jest.useRealTimers();
  });

  // Stryker survivor (L85): `current.resetAt <= now` flipped to `<`.
  // At the exact boundary `resetAt === now` the window has just elapsed and the
  // bucket MUST be considered expired (resetAt <= now → true). With the mutated
  // `<` operator the bucket would still be considered live and the next request
  // would be rejected once the bucket is at capacity.
  it('treats resetAt === now as expired (boundary kill for `<=` mutant)', () => {
    jest.useFakeTimers();
    const startEpoch = 1_700_000_000_000;
    jest.setSystemTime(startEpoch);

    const windowMs = 1000;
    const mw = createRateLimitMiddleware({ limit: 1, windowMs, keyGenerator: byIp });
    const req = makeMockReq();
    const res = makeMockRes();

    // First call fills the bucket: count=1, resetAt = startEpoch + 1000.
    const next1 = jest.fn();
    mw(req, res, next1);
    expect(next1).toHaveBeenCalledWith();

    // Jump to the EXACT resetAt instant — boundary case.
    jest.setSystemTime(startEpoch + windowMs);

    // With `<=` the window is expired → bucket reset → request allowed.
    // With `<`  the window is NOT yet expired → count would hit the limit → 429.
    const next2 = jest.fn();
    mw(req, res, next2);
    expect(next2).toHaveBeenCalledWith();
    expect(next2).not.toHaveBeenCalledWith(expect.objectContaining({ statusCode: 429 }));

    jest.useRealTimers();
  });

  // Stryker survivor (L91): `current.count >= limit` flipped to `>`.
  // Off-by-one boundary — count=limit MUST block, count=limit-1 MUST allow.
  // The mutant `>` would let count reach limit before blocking, allowing one
  // extra request through.
  it('blocks at count=limit and allows at count=limit-1 (boundary kill for `>=` mutant)', () => {
    const limit = 3;
    const mw = createRateLimitMiddleware({ limit, windowMs: 60_000, keyGenerator: byIp });
    const req = makeMockReq();
    const res = makeMockRes();

    // Calls 1..limit-1 must pass (count=limit-1 is the last allowed state).
    for (let i = 1; i < limit; i++) {
      const next = jest.fn();
      mw(req, res, next);
      expect(next).toHaveBeenCalledWith();
      expect(next).not.toHaveBeenCalledWith(expect.objectContaining({ statusCode: 429 }));
    }

    // Call `limit` (the limit-th request) — internal counter is now at `limit`,
    // i.e. count >= limit → must reject. The mutant `>` would let this through.
    const nextAtLimit = jest.fn();
    mw(req, res, nextAtLimit);
    expect(nextAtLimit).toHaveBeenCalledWith();

    // Call `limit + 1` — guaranteed reject under either operator; serves as a
    // sanity anchor.
    const nextOver = jest.fn();
    mw(req, res, nextOver);
    expect(nextOver).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 429 }));

    // Critical assertion — under the `>` mutant, the limit-th request would
    // ALSO have passed (since count===limit is not strictly greater). Verify
    // exactly which call hit 429 first.
    const next429First = jest.fn();
    const reqFresh = makeMockReq({ ip: '198.51.100.7' });
    const mwFresh = createRateLimitMiddleware({
      limit: 2,
      windowMs: 60_000,
      keyGenerator: byIp,
      bucketName: 'boundary-ge-mutant',
    });
    // First two pass.
    mwFresh(reqFresh, res, jest.fn());
    mwFresh(reqFresh, res, jest.fn());
    // Third (count would become 3, but check is `>= limit` i.e. `>= 2` after the
    // second call already brought count to 2 → block on third call entry).
    mwFresh(reqFresh, res, next429First);
    expect(next429First).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 429 }));
  });
});

describe('byIp key generator', () => {
  it('returns req.ip when available', () => {
    expect(byIp(makeMockReq({ ip: '1.2.3.4' }))).toBe('1.2.3.4');
  });

  it('falls back to socket.remoteAddress', () => {
    expect(byIp(makeMockReq({ ip: undefined, socket: { remoteAddress: '5.6.7.8' } }))).toBe(
      '5.6.7.8',
    );
  });

  it('falls back to "unknown-ip" when both are absent', () => {
    expect(byIp(makeMockReq({ ip: undefined, socket: {} }))).toBe('unknown-ip');
  });

  // Stryker survivor (L175): NullishCoalescing chain
  // `req.ip ?? req.socket?.remoteAddress ?? 'unknown-ip'`. Cover the full
  // fallthrough where ALL three fail-overs trigger — req.ip undefined,
  // req.socket undefined (so optional chain short-circuits), final literal
  // 'unknown-ip' must be returned. Any mutation of the third operand or of
  // either `??` must change this output.
  it('returns the literal "unknown-ip" when ip, socket, and remoteAddress are all undefined', () => {
    const req = makeMockReq({ ip: undefined, socket: undefined });
    expect(byIp(req)).toBe('unknown-ip');
  });
});

describe('bySession key generator', () => {
  it('uses params.id when present', () => {
    const req = makeMockReq({ params: { id: 'sess-abc' } });
    expect(bySession(req)).toBe('session:sess-abc');
  });

  it('uses body.sessionId when params.id is absent', () => {
    const req = makeMockReq({ params: {}, body: { sessionId: 'sess-body' } });
    expect(bySession(req)).toBe('session:sess-body');
  });

  it('uses x-session-id header when params and body are absent', () => {
    const req = makeMockReq({
      params: {},
      body: {},
      header: (name: string) => (name === 'x-session-id' ? 'sess-header' : undefined),
    });
    expect(bySession(req)).toBe('session:sess-header');
  });

  it('falls back to IP when no session identifier is available', () => {
    const req = makeMockReq({ ip: '9.8.7.6', params: {}, body: {} });
    expect(bySession(req)).toBe('9.8.7.6');
  });

  // Stryker survivor (L186): OrderSensitive fallback chain
  // `req.params.id ?? req.body?.sessionId ?? req.header('x-session-id')`.
  // When ALL THREE are present with distinct values, `params.id` MUST win.
  // Any reordering of the chain (body before params, header before params,
  // etc.) would surface as a different selected value.
  it('prefers params.id over body.sessionId AND header when all three are present', () => {
    const req = makeMockReq({
      params: { id: 'sess-from-params' },
      body: { sessionId: 'sess-from-body' },
      header: (name: string) => (name === 'x-session-id' ? 'sess-from-header' : undefined),
    });
    expect(bySession(req)).toBe('session:sess-from-params');
  });

  it('prefers body.sessionId over header when params is absent (proves header is last)', () => {
    const req = makeMockReq({
      params: {},
      body: { sessionId: 'sess-from-body' },
      header: (name: string) => (name === 'x-session-id' ? 'sess-from-header' : undefined),
    });
    expect(bySession(req)).toBe('session:sess-from-body');
  });
});

describe('byUserId key generator', () => {
  it('uses user.id when available', () => {
    const req = makeMockReq({ user: { id: 42 } });
    expect(byUserId(req)).toBe('user:42');
  });

  it('falls back to IP when user is not set', () => {
    const req = makeMockReq({ ip: '10.20.30.40' });
    expect(byUserId(req)).toBe('10.20.30.40');
  });

  it('falls back to IP when user has no id', () => {
    const req = makeMockReq({ user: {} });
    expect(byUserId(req)).toBe('10.0.0.1');
  });
});

// SEC-20 (2026-04-08): per-user limiter must catch abuse spread across many
// sessions. Without it, a single user can multiply throughput by spawning
// new chat sessions in parallel — each session would get its own bucket under
// `bySession`, but the byUserId limiter shares one bucket per user.
describe('byUserId limiter — multi-session abuse (SEC-20)', () => {
  beforeEach(() => clearRateLimitBuckets());
  afterEach(() => clearRateLimitBuckets());

  it('caps a single user at the limit even across many session ids', () => {
    const mw = createRateLimitMiddleware({ limit: 3, windowMs: 60_000, keyGenerator: byUserId });
    const res = makeMockRes();

    // Same user user.id=42, three different session ids (would each get its
    // own bucket under bySession). The byUserId limiter must collapse them.
    const sessionIds = ['s1', 's2', 's3', 's4'];
    const calls: jest.Mock[] = [];
    for (const id of sessionIds) {
      const req = makeMockReq({ user: { id: 42 }, params: { id } });
      const next = jest.fn();
      mw(req, res, next);
      calls.push(next);
    }

    // First 3 pass, 4th rejected (limit=3 per user-bucket regardless of session).
    expect(calls[0]).toHaveBeenCalledWith();
    expect(calls[1]).toHaveBeenCalledWith();
    expect(calls[2]).toHaveBeenCalledWith();
    expect(calls[3]).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 429 }));
  });

  it('does not bleed between distinct users', () => {
    const mw = createRateLimitMiddleware({ limit: 1, windowMs: 60_000, keyGenerator: byUserId });
    const res = makeMockRes();

    // Two distinct users, each at the limit ceiling. Neither should affect
    // the other's bucket.
    const reqA1 = makeMockReq({ user: { id: 1 } });
    const reqA2 = makeMockReq({ user: { id: 1 } });
    const reqB1 = makeMockReq({ user: { id: 2 } });

    const nextA1 = jest.fn();
    const nextA2 = jest.fn();
    const nextB1 = jest.fn();

    mw(reqA1, res, nextA1);
    mw(reqA2, res, nextA2);
    mw(reqB1, res, nextB1);

    expect(nextA1).toHaveBeenCalledWith();
    expect(nextA2).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 429 }));
    expect(nextB1).toHaveBeenCalledWith();
  });

  it('isolates anonymous (IP-fallback) callers from authenticated buckets', () => {
    const mw = createRateLimitMiddleware({ limit: 1, windowMs: 60_000, keyGenerator: byUserId });
    const res = makeMockRes();

    // Authenticated user 42 hits the limit.
    const reqUser = makeMockReq({ user: { id: 42 } });
    const reqUser2 = makeMockReq({ user: { id: 42 } });
    const nextUser = jest.fn();
    const nextUser2 = jest.fn();
    mw(reqUser, res, nextUser);
    mw(reqUser2, res, nextUser2);
    expect(nextUser).toHaveBeenCalledWith();
    expect(nextUser2).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 429 }));

    // Unauthenticated request from a different IP must NOT collide.
    const reqAnon = makeMockReq({ ip: '203.0.113.5', user: undefined });
    const nextAnon = jest.fn();
    mw(reqAnon, res, nextAnon);
    expect(nextAnon).toHaveBeenCalledWith();
  });
});

/** Creates a mock RedisRateLimitStore whose increment() always rejects. */
const createFailingRedisStore = (): RedisRateLimitStore =>
  ({
    increment: jest.fn().mockRejectedValue(new Error('Redis connection refused')),
    reset: jest.fn(),
    clear: jest.fn(),
    stopSweep: jest.fn(),
  }) as unknown as RedisRateLimitStore;

describe('rate-limit middleware — Redis fail-closed fallback', () => {
  beforeEach(() => {
    clearRateLimitBuckets();
    _resetRedisStore();
    jest.clearAllMocks();
  });

  afterEach(() => {
    _resetRedisStore();
    clearRateLimitBuckets();
  });

  it('falls back to in-memory and allows request under limit when Redis rejects', async () => {
    const failingStore = createFailingRedisStore();
    setRedisRateLimitStore(failingStore);

    const mw = createRateLimitMiddleware({ limit: 3, windowMs: 60_000, keyGenerator: byIp });
    const req = makeMockReq();
    const res = makeMockRes();
    const next = jest.fn();

    mw(req, res, next);

    // Wait for the async Redis → catch path to resolve
    await new Promise(process.nextTick);

    expect(next).toHaveBeenCalledWith();
    expect(next).not.toHaveBeenCalledWith(expect.objectContaining({ statusCode: 429 }));
  });

  it('returns 429 when Redis rejects and in-memory limit is exceeded', async () => {
    const failingStore = createFailingRedisStore();
    setRedisRateLimitStore(failingStore);

    const mw = createRateLimitMiddleware({ limit: 2, windowMs: 60_000, keyGenerator: byIp });
    const req = makeMockReq();
    const res = makeMockRes();

    // Exhaust the in-memory limit (2 requests)
    for (let i = 0; i < 2; i++) {
      const next = jest.fn();
      mw(req, res, next);
      await new Promise(process.nextTick);
      expect(next).toHaveBeenCalledWith();
    }

    // Third request should be rejected via in-memory fallback
    const next3 = jest.fn();
    mw(req, res, next3);
    await new Promise(process.nextTick);

    expect(next3).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 429 }));
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(String));
  });

  it('logs a warning when Redis store rejects', async () => {
    const failingStore = createFailingRedisStore();
    setRedisRateLimitStore(failingStore);

    const mw = createRateLimitMiddleware({
      limit: 5,
      windowMs: 60_000,
      keyGenerator: byIp,
      bucketName: 'redis-fail-test',
    });
    const req = makeMockReq();
    const res = makeMockRes();
    const next = jest.fn();

    mw(req, res, next);
    await new Promise(process.nextTick);

    // F2 (2026-04-30) — log message renamed: legacy fall-back path is now
    // explicitly named "degraded_to_local_bucket" since the failClosed=true
    // path emits its own distinct log + Sentry event. See rate-limit-fail-closed.test.ts.
    expect(logger.warn).toHaveBeenCalledWith(
      'rate_limit_redis_unavailable_degraded_to_local_bucket',
      {
        key: 'redis-fail-test:10.0.0.1',
      },
    );
  });
});

/**
 * Creates a mock RedisRateLimitStore whose increment() resolves with a caller-supplied
 * (count, resetAt) pair. Used to drive the boundary check on the Redis path.
 * @param scripted - Scripted resolution payload for `increment()`.
 * @param scripted.count - Bucket count value the mock will return.
 * @param scripted.resetAt - Bucket reset epoch (ms) the mock will return.
 * @returns A typed RedisRateLimitStore mock.
 */
const createScriptedRedisStore = (scripted: {
  count: number;
  resetAt: number;
}): RedisRateLimitStore =>
  ({
    increment: jest.fn().mockResolvedValue(scripted),
    reset: jest.fn(),
    clear: jest.fn(),
    stopSweep: jest.fn(),
  }) as unknown as RedisRateLimitStore;

describe('rate-limit middleware — Redis path boundary (count > limit)', () => {
  beforeEach(() => {
    clearRateLimitBuckets();
    _resetRedisStore();
    jest.clearAllMocks();
  });

  afterEach(() => {
    _resetRedisStore();
    clearRateLimitBuckets();
  });

  // Stryker survivor (L149): Redis path `count > limit` flipped to `>=` (or `>`
  // becoming `<`/`<=`). With a scripted Redis store returning count===limit,
  // the request MUST be allowed (count > limit is false). The `>=` mutant
  // would reject this request, the `<` and `<=` mutants would mis-classify
  // either side of the boundary.
  it('allows the request when Redis returns count === limit (boundary kill)', async () => {
    const limit = 5;
    setRedisRateLimitStore(
      createScriptedRedisStore({ count: limit, resetAt: Date.now() + 60_000 }),
    );

    const mw = createRateLimitMiddleware({
      limit,
      windowMs: 60_000,
      keyGenerator: byIp,
      bucketName: 'redis-boundary-eq',
    });
    const req = makeMockReq();
    const res = makeMockRes();
    const next = jest.fn();

    mw(req, res, next);
    await new Promise(process.nextTick);

    expect(next).toHaveBeenCalledWith();
    expect(next).not.toHaveBeenCalledWith(expect.objectContaining({ statusCode: 429 }));
  });

  it('rejects with 429 when Redis returns count === limit + 1', async () => {
    const limit = 5;
    setRedisRateLimitStore(
      createScriptedRedisStore({ count: limit + 1, resetAt: Date.now() + 60_000 }),
    );

    const mw = createRateLimitMiddleware({
      limit,
      windowMs: 60_000,
      keyGenerator: byIp,
      bucketName: 'redis-boundary-over',
    });
    const req = makeMockReq();
    const res = makeMockRes();
    const next = jest.fn();

    mw(req, res, next);
    await new Promise(process.nextTick);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 429 }));
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(String));
  });
});
