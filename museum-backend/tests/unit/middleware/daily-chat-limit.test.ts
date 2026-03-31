import type { RequestHandler } from 'express';
import type { CacheService } from '@shared/cache/cache.port';
import {
  dailyChatLimit,
  clearDailyChatLimitBuckets,
  setDailyChatLimitCacheService,
  _resetDailyChatLimitCacheService,
} from '@src/helpers/middleware/daily-chat-limit.middleware';

const makeMockReq = (overrides: Record<string, unknown> = {}): Parameters<RequestHandler>[0] =>
  ({
    ip: '10.0.0.1',
    socket: { remoteAddress: '10.0.0.1' },
    params: {},
    body: {},
    ...overrides,
  }) as unknown as Parameters<RequestHandler>[0];

const makeMockRes = () => {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res as unknown as Parameters<RequestHandler>[1];
};

describe('dailyChatLimit middleware', () => {
  beforeEach(() => {
    clearDailyChatLimitBuckets();
  });
  afterEach(() => {
    clearDailyChatLimitBuckets();
  });

  it('allows requests under the limit', () => {
    const req = makeMockReq({ user: { id: 1 } });
    const res = makeMockRes();
    const next = jest.fn();

    dailyChatLimit(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect((res as unknown as { status: jest.Mock }).status).not.toHaveBeenCalled();
  });

  it('blocks requests at the limit with 429', () => {
    const req = makeMockReq({ user: { id: 2 } });

    // Exhaust the limit (default 100)
    for (let i = 0; i < 100; i++) {
      const res = makeMockRes();
      const next = jest.fn();
      dailyChatLimit(req, res, next);
      expect(next).toHaveBeenCalledWith();
    }

    // The 101st request should be blocked
    const res = makeMockRes();
    const next = jest.fn();
    dailyChatLimit(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 429,
        code: 'DAILY_LIMIT_REACHED',
        message: 'Daily chat limit reached',
      }),
    );
  });

  it('resets counter on a new day', () => {
    const req = makeMockReq({ user: { id: 3 } });

    // Use up the limit
    for (let i = 0; i < 100; i++) {
      const res = makeMockRes();
      const next = jest.fn();
      dailyChatLimit(req, res, next);
    }

    // Verify blocked
    const blockedRes = makeMockRes();
    const blockedNext = jest.fn();
    dailyChatLimit(req, blockedRes, blockedNext);
    expect(blockedNext).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 429 }));

    // Simulate next day by advancing fake timers past midnight
    jest.useFakeTimers();
    jest.setSystemTime(new Date(Date.now() + 24 * 60 * 60 * 1000));

    // Should be allowed again on the new day
    const res = makeMockRes();
    const next = jest.fn();
    dailyChatLimit(req, res, next);
    expect(next).toHaveBeenCalledWith();

    jest.useRealTimers();
  });

  it('skips if no user (unauthenticated)', () => {
    const req = makeMockReq(); // no user property
    const res = makeMockRes();
    const next = jest.fn();

    dailyChatLimit(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect((res as unknown as { status: jest.Mock }).status).not.toHaveBeenCalled();
  });

  it('skips if user has no id', () => {
    const req = makeMockReq({ user: {} });
    const res = makeMockRes();
    const next = jest.fn();

    dailyChatLimit(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });
});

// ---------------------------------------------------------------------------
// Redis distributed path
// ---------------------------------------------------------------------------

/** Creates a mock CacheService with jest.fn() stubs for every method. */
const makeMockCacheService = (
  overrides: Partial<Record<keyof CacheService, jest.Mock>> = {},
): CacheService & Record<keyof CacheService, jest.Mock> =>
  ({
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
    delByPrefix: jest.fn().mockResolvedValue(undefined),
    setNx: jest.fn().mockResolvedValue(true),
    ping: jest.fn().mockResolvedValue(true),
    ...overrides,
  }) as unknown as CacheService & Record<keyof CacheService, jest.Mock>;

describe('dailyChatLimit middleware — Redis distributed path', () => {
  beforeEach(() => {
    clearDailyChatLimitBuckets();
    _resetDailyChatLimitCacheService();
  });
  afterEach(() => {
    clearDailyChatLimitBuckets();
    _resetDailyChatLimitCacheService();
  });

  const todayStr = (): string => new Date().toISOString().slice(0, 10);

  it('stores and retrieves counts via cache when CacheService is registered', async () => {
    const cache = makeMockCacheService();
    setDailyChatLimitCacheService(cache);

    const req = makeMockReq({ user: { id: 100 } });
    const res = makeMockRes();
    const next = jest.fn();

    dailyChatLimit(req, res, next);

    // Wait for the async chain to settle
    await new Promise(process.nextTick);

    const expectedKey = `daily-chat:100:${todayStr()}`;
    expect(cache.get).toHaveBeenCalledWith(expectedKey);
    expect(cache.set).toHaveBeenCalledWith(expectedKey, 1, expect.any(Number));

    // Verify TTL is a positive number (seconds until midnight)
    const ttlArg = (cache.set as jest.Mock).mock.calls[0][2] as number;
    expect(ttlArg).toBeGreaterThan(0);
    expect(ttlArg).toBeLessThanOrEqual(86400);

    expect(next).toHaveBeenCalledWith();
  });

  it('returns 429 when cache returns count at limit', async () => {
    const cache = makeMockCacheService({
      get: jest.fn().mockResolvedValue(100), // default limit is 100
    });
    setDailyChatLimitCacheService(cache);

    const req = makeMockReq({ user: { id: 200 } });
    const res = makeMockRes();
    const next = jest.fn();

    dailyChatLimit(req, res, next);

    await new Promise(process.nextTick);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 429,
        code: 'DAILY_LIMIT_REACHED',
        message: 'Daily chat limit reached',
      }),
    );
    // Should not attempt to set when at limit
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('allows request and increments count when cache returns count under limit', async () => {
    const cache = makeMockCacheService({
      get: jest.fn().mockResolvedValue(42),
    });
    setDailyChatLimitCacheService(cache);

    const req = makeMockReq({ user: { id: 300 } });
    const res = makeMockRes();
    const next = jest.fn();

    dailyChatLimit(req, res, next);

    await new Promise(process.nextTick);

    expect(next).toHaveBeenCalledWith();
    expect(cache.set).toHaveBeenCalledWith(`daily-chat:300:${todayStr()}`, 43, expect.any(Number));
  });

  it('falls back to in-memory when cache.get rejects', async () => {
    const cache = makeMockCacheService({
      get: jest.fn().mockRejectedValue(new Error('Redis connection lost')),
    });
    setDailyChatLimitCacheService(cache);

    const req = makeMockReq({ user: { id: 400 } });
    const res = makeMockRes();
    const next = jest.fn();

    dailyChatLimit(req, res, next);

    await new Promise(process.nextTick);

    // Request should still pass via in-memory fallback
    expect(next).toHaveBeenCalledWith();
    // cache.set should NOT be called because get already failed
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('still completes request when cache.set rejects', async () => {
    const cache = makeMockCacheService({
      get: jest.fn().mockResolvedValue(5),
      set: jest.fn().mockRejectedValue(new Error('Redis write timeout')),
    });
    setDailyChatLimitCacheService(cache);

    const req = makeMockReq({ user: { id: 500 } });
    const res = makeMockRes();
    const next = jest.fn();

    dailyChatLimit(req, res, next);

    await new Promise(process.nextTick);

    // cache.set was called but rejected — falls back to in-memory
    expect(cache.set).toHaveBeenCalled();
    // Request still passes via the in-memory fallback in .catch()
    expect(next).toHaveBeenCalledWith();
  });
});
