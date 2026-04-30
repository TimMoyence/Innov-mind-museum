/**
 * F2 (2026-04-30) — fail-closed contract for the rate-limit middleware.
 *
 * Original behaviour silently degraded to per-instance in-memory buckets when
 * the Redis store rejected. In multi-instance prod that disables distributed
 * limits — every replica gets its own bucket, defeating the control. This
 * suite asserts the new contract:
 *   - failClosed=true  (prod default): respond 503 + Retry-After + Sentry alert
 *   - failClosed=false (dev default):  fall back to in-memory bucket (legacy)
 */
import type { Request } from 'express';

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockCaptureException = jest.fn();
jest.mock('@shared/observability/sentry', () => ({
  captureExceptionWithContext: (...args: unknown[]) => mockCaptureException(...args),
  isSentryEnabled: () => true,
}));

const mockFailClosed = { value: false };
jest.mock('@src/config/env', () => ({
  __esModule: true,
  get env() {
    return {
      rateLimit: {
        ipLimit: 200,
        sessionLimit: 120,
        userLimit: 200,
        windowMs: 60000,
        failClosed: mockFailClosed.value,
      },
    };
  },
}));

import {
  createRateLimitMiddleware,
  byIp,
  setRedisRateLimitStore,
  clearRateLimitBuckets,
  _resetRedisStore,
} from '@src/helpers/middleware/rate-limit.middleware';
import type { RedisRateLimitStore } from '@src/helpers/middleware/redis-rate-limit-store';
import { makePartialRequest, makePartialResponse } from '../../helpers/http/express-mock.helpers';

const makeReq = (): Request =>
  makePartialRequest({ ip: '10.0.0.1', socket: { remoteAddress: '10.0.0.1' } });

const downRedisStore = (): RedisRateLimitStore =>
  ({
    increment: jest.fn().mockRejectedValue(new Error('redis ECONNREFUSED')),
    clear: jest.fn(),
    stopSweep: jest.fn(),
  }) as unknown as RedisRateLimitStore;

describe('F2 — rate-limit fail-closed when Redis is down', () => {
  beforeEach(() => {
    clearRateLimitBuckets();
    mockCaptureException.mockClear();
  });

  afterEach(() => {
    _resetRedisStore();
    clearRateLimitBuckets();
    mockFailClosed.value = false;
  });

  it('failClosed=true: returns 503 with Retry-After when Redis is down (does NOT fall back to memory bucket)', async () => {
    mockFailClosed.value = true;
    setRedisRateLimitStore(downRedisStore());

    const mw = createRateLimitMiddleware({
      limit: 5,
      windowMs: 60_000,
      keyGenerator: byIp,
      bucketName: 'failclosed-test',
    });

    const req = makeReq();
    const res = makePartialResponse();
    const next = jest.fn();

    mw(req, res, next);
    // Async catch resolution — wait one microtask + a setImmediate tick.
    await new Promise((r) => setImmediate(r));

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 503,
        code: 'RATE_LIMIT_UNAVAILABLE',
      }),
    );
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(String));
  });

  it('failClosed=true: emits Sentry alert when Redis is down', async () => {
    mockFailClosed.value = true;
    setRedisRateLimitStore(downRedisStore());

    const mw = createRateLimitMiddleware({
      limit: 5,
      windowMs: 60_000,
      keyGenerator: byIp,
      bucketName: 'failclosed-sentry',
    });

    const req = makeReq();
    const res = makePartialResponse();
    const next = jest.fn();

    mw(req, res, next);
    await new Promise((r) => setImmediate(r));

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ component: 'rate-limit', mode: 'fail-closed' }),
    );
  });

  it('failClosed=false: falls back to in-memory bucket when Redis is down (legacy behaviour)', async () => {
    mockFailClosed.value = false;
    setRedisRateLimitStore(downRedisStore());

    const mw = createRateLimitMiddleware({
      limit: 2,
      windowMs: 60_000,
      keyGenerator: byIp,
      bucketName: 'failopen-test',
    });

    const req = makeReq();
    const res = makePartialResponse();

    const next1 = jest.fn();
    mw(req, res, next1);
    await new Promise((r) => setImmediate(r));
    expect(next1).toHaveBeenCalledWith();

    const next2 = jest.fn();
    mw(req, res, next2);
    await new Promise((r) => setImmediate(r));
    expect(next2).toHaveBeenCalledWith();

    // Third request should hit local bucket cap (limit=2 → 429).
    const next3 = jest.fn();
    mw(req, res, next3);
    await new Promise((r) => setImmediate(r));
    expect(next3).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 429 }));
  });

  it('failClosed=false: does NOT emit Sentry alert (legacy fallback path)', async () => {
    mockFailClosed.value = false;
    setRedisRateLimitStore(downRedisStore());

    const mw = createRateLimitMiddleware({
      limit: 5,
      windowMs: 60_000,
      keyGenerator: byIp,
      bucketName: 'failopen-no-sentry',
    });

    const req = makeReq();
    const res = makePartialResponse();
    const next = jest.fn();

    mw(req, res, next);
    await new Promise((r) => setImmediate(r));

    expect(mockCaptureException).not.toHaveBeenCalled();
  });
});
