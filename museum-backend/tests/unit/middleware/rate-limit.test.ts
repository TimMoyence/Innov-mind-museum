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
} from '@shared/middleware/rate-limit.middleware';
import type { RedisRateLimitStore } from '@shared/middleware/redis-rate-limit-store';
import { makePartialRequest, makePartialResponse } from '../../helpers/http/express-mock.helpers';

const makeMockReq = (overrides: Record<string, unknown> = {}): Request =>
  makePartialRequest({
    ip: '10.0.0.1',
    socket: { remoteAddress: '10.0.0.1' },
    ...overrides,
  });

const makeMockRes = makePartialResponse;

describe('rate-limit middleware — branch coverage', () => {
  beforeEach(() => {
    clearRateLimitBuckets();
  });
  afterEach(() => {
    clearRateLimitBuckets();
  });

  it('allows requests up to the limit then rejects with 429', () => {
    const mw = createRateLimitMiddleware({ limit: 2, windowMs: 60_000, keyGenerator: byIp });
    const req = makeMockReq();
    const res = makeMockRes();

    const next1 = jest.fn();
    mw(req, res, next1);
    expect(next1).toHaveBeenCalledWith();

    const next2 = jest.fn();
    mw(req, res, next2);
    expect(next2).toHaveBeenCalledWith();

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

    jest.advanceTimersByTime(windowMs + 1);

    const next2 = jest.fn();
    mw(req, res, next2);
    expect(next2).toHaveBeenCalledWith();

    jest.useRealTimers();
  });

  it('treats resetAt === now as expired (boundary kill for `<=` mutant)', () => {
    jest.useFakeTimers();
    const startEpoch = 1_700_000_000_000;
    jest.setSystemTime(startEpoch);

    const windowMs = 1000;
    const mw = createRateLimitMiddleware({ limit: 1, windowMs, keyGenerator: byIp });
    const req = makeMockReq();
    const res = makeMockRes();

    const next1 = jest.fn();
    mw(req, res, next1);
    expect(next1).toHaveBeenCalledWith();

    jest.setSystemTime(startEpoch + windowMs);

    const next2 = jest.fn();
    mw(req, res, next2);
    expect(next2).toHaveBeenCalledWith();
    expect(next2).not.toHaveBeenCalledWith(expect.objectContaining({ statusCode: 429 }));

    jest.useRealTimers();
  });

  it('blocks at count=limit and allows at count=limit-1 (boundary kill for `>=` mutant)', () => {
    const limit = 3;
    const mw = createRateLimitMiddleware({ limit, windowMs: 60_000, keyGenerator: byIp });
    const req = makeMockReq();
    const res = makeMockRes();

    for (let i = 1; i < limit; i++) {
      const next = jest.fn();
      mw(req, res, next);
      expect(next).toHaveBeenCalledWith();
      expect(next).not.toHaveBeenCalledWith(expect.objectContaining({ statusCode: 429 }));
    }

    const nextAtLimit = jest.fn();
    mw(req, res, nextAtLimit);
    expect(nextAtLimit).toHaveBeenCalledWith();

    const nextOver = jest.fn();
    mw(req, res, nextOver);
    expect(nextOver).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 429 }));

    const next429First = jest.fn();
    const reqFresh = makeMockReq({ ip: '198.51.100.7' });
    const mwFresh = createRateLimitMiddleware({
      limit: 2,
      windowMs: 60_000,
      keyGenerator: byIp,
      bucketName: 'boundary-ge-mutant',
    });
    mwFresh(reqFresh, res, jest.fn());
    mwFresh(reqFresh, res, jest.fn());
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

describe('byUserId limiter — multi-session abuse (SEC-20)', () => {
  beforeEach(() => {
    clearRateLimitBuckets();
  });
  afterEach(() => {
    clearRateLimitBuckets();
  });

  it('caps a single user at the limit even across many session ids', () => {
    const mw = createRateLimitMiddleware({ limit: 3, windowMs: 60_000, keyGenerator: byUserId });
    const res = makeMockRes();

    const sessionIds = ['s1', 's2', 's3', 's4'];
    const calls: jest.Mock[] = [];
    for (const id of sessionIds) {
      const req = makeMockReq({ user: { id: 42 }, params: { id } });
      const next = jest.fn();
      mw(req, res, next);
      calls.push(next);
    }

    expect(calls[0]).toHaveBeenCalledWith();
    expect(calls[1]).toHaveBeenCalledWith();
    expect(calls[2]).toHaveBeenCalledWith();
    expect(calls[3]).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 429 }));
  });

  it('does not bleed between distinct users', () => {
    const mw = createRateLimitMiddleware({ limit: 1, windowMs: 60_000, keyGenerator: byUserId });
    const res = makeMockRes();

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

    const reqUser = makeMockReq({ user: { id: 42 } });
    const reqUser2 = makeMockReq({ user: { id: 42 } });
    const nextUser = jest.fn();
    const nextUser2 = jest.fn();
    mw(reqUser, res, nextUser);
    mw(reqUser2, res, nextUser2);
    expect(nextUser).toHaveBeenCalledWith();
    expect(nextUser2).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 429 }));

    const reqAnon = makeMockReq({ ip: '203.0.113.5', user: undefined });
    const nextAnon = jest.fn();
    mw(reqAnon, res, nextAnon);
    expect(nextAnon).toHaveBeenCalledWith();
  });
});

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

    for (let i = 0; i < 2; i++) {
      const next = jest.fn();
      mw(req, res, next);
      await new Promise(process.nextTick);
      expect(next).toHaveBeenCalledWith();
    }

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

    expect(logger.warn).toHaveBeenCalledWith(
      'rate_limit_redis_unavailable_degraded_to_local_bucket',
      {
        key: 'redis-fail-test:10.0.0.1',
      },
    );
  });
});

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

describe('PR-11 extensions — custom errorCode / errorMessage / statusCode (R1)', () => {
  beforeEach(() => {
    clearRateLimitBuckets();
    _resetRedisStore();
    jest.clearAllMocks();
  });
  afterEach(() => {
    _resetRedisStore();
    clearRateLimitBuckets();
  });

  it('emits AppError with custom errorCode/errorMessage/statusCode + details:{limit} on cap (in-memory path)', () => {
    const mw = createRateLimitMiddleware({
      limit: 1,
      windowMs: 60_000,
      keyGenerator: byIp,
      bucketName: 'pr11-custom-emit',
      errorCode: 'DAILY_LIMIT_REACHED',
      errorMessage: 'Daily chat limit reached',
      statusCode: 429,
    });
    const req = makeMockReq();
    const res = makeMockRes();

    mw(req, res, jest.fn());

    const next = jest.fn();
    mw(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 429,
        code: 'DAILY_LIMIT_REACHED',
        message: 'Daily chat limit reached',
        details: { limit: 1 },
      }),
    );
  });

  it('emits custom AppError on cap via the Redis path (count > limit)', async () => {
    const limit = 2;
    setRedisRateLimitStore({
      increment: jest.fn().mockResolvedValue({ count: limit + 1, resetAt: Date.now() + 60_000 }),
      reset: jest.fn(),
      clear: jest.fn(),
      stopSweep: jest.fn(),
    } as unknown as RedisRateLimitStore);

    const mw = createRateLimitMiddleware({
      limit,
      windowMs: 60_000,
      keyGenerator: byIp,
      bucketName: 'pr11-redis-custom-emit',
      errorCode: 'DAILY_LIMIT_REACHED',
      errorMessage: 'Daily chat limit reached',
      statusCode: 429,
    });
    const req = makeMockReq();
    const res = makeMockRes();
    const next = jest.fn();

    mw(req, res, next);
    await new Promise(process.nextTick);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 429,
        code: 'DAILY_LIMIT_REACHED',
        message: 'Daily chat limit reached',
        details: { limit },
      }),
    );
  });

  it('keeps default tooManyRequests(...) wire format when ALL THREE options omitted (regression guard for R1.5)', () => {
    const mw = createRateLimitMiddleware({
      limit: 1,
      windowMs: 60_000,
      keyGenerator: byIp,
      bucketName: 'pr11-default-emit',
    });
    const req = makeMockReq();
    const res = makeMockRes();

    mw(req, res, jest.fn());

    const next = jest.fn();
    mw(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 429,
        code: 'TOO_MANY_REQUESTS',
        message: 'Too many requests. Please retry later.',
      }),
    );
  });
});

describe('PR-11 extensions — keyGenerator returning null skips the middleware (R2.1)', () => {
  beforeEach(() => {
    clearRateLimitBuckets();
    _resetRedisStore();
    jest.clearAllMocks();
  });
  afterEach(() => {
    _resetRedisStore();
    clearRateLimitBuckets();
  });

  it('calls next() with no args and does NOT touch the Redis store when keyGenerator returns null', async () => {
    const incrementSpy = jest.fn().mockResolvedValue({ count: 1, resetAt: Date.now() + 60_000 });
    setRedisRateLimitStore({
      increment: incrementSpy,
      reset: jest.fn(),
      clear: jest.fn(),
      stopSweep: jest.fn(),
    } as unknown as RedisRateLimitStore);

    const mw = createRateLimitMiddleware({
      limit: 5,
      windowMs: 60_000,
      keyGenerator: () => null,
      bucketName: 'pr11-null-skip',
    });
    const req = makeMockReq();
    const res = makeMockRes();
    const next = jest.fn();

    mw(req, res, next);
    await new Promise(process.nextTick);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
    expect(incrementSpy).not.toHaveBeenCalled();
  });

  it('does NOT touch the in-memory bucket store when keyGenerator returns null (no Redis configured)', () => {
    const mw = createRateLimitMiddleware({
      limit: 1,
      windowMs: 60_000,
      keyGenerator: () => null,
      bucketName: 'pr11-null-skip-memory',
    });
    const req = makeMockReq();
    const res = makeMockRes();

    for (let i = 0; i < 5; i++) {
      const next = jest.fn();
      mw(req, res, next);
      expect(next).toHaveBeenCalledWith();
      expect(next).not.toHaveBeenCalledWith(expect.objectContaining({ statusCode: 429 }));
    }
  });
});

describe('PR-11 extensions — windowMs as function resolved per-request (R7)', () => {
  beforeEach(() => {
    clearRateLimitBuckets();
    _resetRedisStore();
    jest.clearAllMocks();
  });
  afterEach(() => {
    _resetRedisStore();
    clearRateLimitBuckets();
  });

  it('passes the function-resolved windowMs to RedisRateLimitStore.increment', async () => {
    const incrementSpy = jest.fn().mockResolvedValue({ count: 1, resetAt: Date.now() + 60_000 });
    setRedisRateLimitStore({
      increment: incrementSpy,
      reset: jest.fn(),
      clear: jest.fn(),
      stopSweep: jest.fn(),
    } as unknown as RedisRateLimitStore);

    const mw = createRateLimitMiddleware({
      limit: 5,
      windowMs: () => 5000,
      keyGenerator: byIp,
      bucketName: 'pr11-windowms-fn',
    });
    const req = makeMockReq();
    const res = makeMockRes();
    const next = jest.fn();

    mw(req, res, next);
    await new Promise(process.nextTick);

    expect(incrementSpy).toHaveBeenCalledWith(expect.any(String), 5000);
  });

  it('re-evaluates windowMs per request (different return values across calls)', async () => {
    const incrementSpy = jest.fn().mockResolvedValue({ count: 1, resetAt: Date.now() + 60_000 });
    setRedisRateLimitStore({
      increment: incrementSpy,
      reset: jest.fn(),
      clear: jest.fn(),
      stopSweep: jest.fn(),
    } as unknown as RedisRateLimitStore);

    const windowSequence = [1000, 2000, 3000];
    let callIdx = 0;
    const windowMsFn = jest.fn().mockImplementation(() => {
      const v = windowSequence[callIdx];
      callIdx += 1;
      return v;
    });

    const mw = createRateLimitMiddleware({
      limit: 999,
      windowMs: windowMsFn,
      keyGenerator: byIp,
      bucketName: 'pr11-windowms-perreq',
    });
    const req = makeMockReq();
    const res = makeMockRes();

    for (let i = 0; i < 3; i++) {
      mw(req, res, jest.fn());
      await new Promise(process.nextTick);
    }

    expect(windowMsFn).toHaveBeenCalledTimes(3);
    expect(incrementSpy).toHaveBeenNthCalledWith(1, expect.any(String), 1000);
    expect(incrementSpy).toHaveBeenNthCalledWith(2, expect.any(String), 2000);
    expect(incrementSpy).toHaveBeenNthCalledWith(3, expect.any(String), 3000);
  });
});

describe('PR-11 extensions — bucketName empty string opts out of namespace prefix (R8)', () => {
  beforeEach(() => {
    clearRateLimitBuckets();
    _resetRedisStore();
    jest.clearAllMocks();
  });
  afterEach(() => {
    _resetRedisStore();
    clearRateLimitBuckets();
  });

  it("forwards the raw keyGenerator output as the Redis key when bucketName === ''", async () => {
    const incrementSpy = jest.fn().mockResolvedValue({ count: 1, resetAt: Date.now() + 60_000 });
    setRedisRateLimitStore({
      increment: incrementSpy,
      reset: jest.fn(),
      clear: jest.fn(),
      stopSweep: jest.fn(),
    } as unknown as RedisRateLimitStore);

    const mw = createRateLimitMiddleware({
      limit: 5,
      windowMs: 60_000,
      keyGenerator: () => 'daily-chat:42:2026-05-23',
      bucketName: '',
    });
    const req = makeMockReq();
    const res = makeMockRes();
    const next = jest.fn();

    mw(req, res, next);
    await new Promise(process.nextTick);

    expect(incrementSpy).toHaveBeenCalledWith('daily-chat:42:2026-05-23', expect.any(Number));
    expect(incrementSpy).not.toHaveBeenCalledWith(':daily-chat:42:2026-05-23', expect.any(Number));
  });

  it('still prepends the namespace prefix when bucketName is a non-empty string (regression guard for R8.2)', async () => {
    const incrementSpy = jest.fn().mockResolvedValue({ count: 1, resetAt: Date.now() + 60_000 });
    setRedisRateLimitStore({
      increment: incrementSpy,
      reset: jest.fn(),
      clear: jest.fn(),
      stopSweep: jest.fn(),
    } as unknown as RedisRateLimitStore);

    const mw = createRateLimitMiddleware({
      limit: 5,
      windowMs: 60_000,
      keyGenerator: () => 'x:y',
      bucketName: 'ns',
    });
    const req = makeMockReq();
    const res = makeMockRes();
    const next = jest.fn();

    mw(req, res, next);
    await new Promise(process.nextTick);

    expect(incrementSpy).toHaveBeenCalledWith('ns:x:y', expect.any(Number));
  });
});
