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
import { makePartialResponse } from '../../helpers/http/express-mock.helpers';

const makeMockReq = (overrides: Record<string, unknown> = {}): Request =>
  ({
    ip: '10.0.0.1',
    socket: { remoteAddress: '10.0.0.1' },
    params: {},
    body: {},
    header: () => undefined,
    ...overrides,
  }) as unknown as Request;

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

    expect(logger.warn).toHaveBeenCalledWith('rate_limit_redis_fail_closed_fallback', {
      key: 'redis-fail-test:10.0.0.1',
    });
  });
});
