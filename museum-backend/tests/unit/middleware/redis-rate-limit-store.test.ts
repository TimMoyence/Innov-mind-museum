import type Redis from 'ioredis';
import { RedisRateLimitStore } from '@src/helpers/middleware/redis-rate-limit-store';

/** Creates a mock ioredis client with chainable multi(). */
const createMockRedis = () => {
  const execResults: [Error | null, unknown][][] = [];
  let nextExecResult: [Error | null, unknown][] | null = null;

  const multi = {
    incr: jest.fn().mockReturnThis(),
    pttl: jest.fn().mockReturnThis(),
    exec: jest.fn(async () => nextExecResult ?? execResults.shift() ?? null),
  };

  const redis = {
    multi: jest.fn(() => multi),
    pexpire: jest.fn(async () => 1),
    del: jest.fn(async () => 1),
    on: jest.fn().mockReturnThis(),
    // expose internals for test control
    __multi: multi,
    __setExecResult: (result: [Error | null, unknown][]) => {
      nextExecResult = result;
    },
    __pushExecResult: (result: [Error | null, unknown][]) => {
      nextExecResult = null;
      execResults.push(result);
    },
    __clearExecResult: () => {
      nextExecResult = null;
      execResults.length = 0;
    },
  };

  return redis;
};

type MockRedis = ReturnType<typeof createMockRedis>;

describe('RedisRateLimitStore', () => {
  let mockRedis: MockRedis;
  let store: RedisRateLimitStore;

  beforeEach(() => {
    mockRedis = createMockRedis();
    store = new RedisRateLimitStore(mockRedis as unknown as Redis);
  });

  afterEach(() => {
    store.clear();
  });

  describe('increment', () => {
    it('increments and sets expiry on first request (count=1)', async () => {
      mockRedis.__setExecResult([
        [null, 1],  // INCR result = 1
        [null, -2], // PTTL result = -2 (no expiry yet)
      ]);

      const result = await store.increment('ip:1.2.3.4', 60_000);

      expect(result.count).toBe(1);
      expect(result.resetAt).toBeGreaterThan(Date.now() - 1000);
      expect(result.resetAt).toBeLessThanOrEqual(Date.now() + 60_000 + 100);
      expect(mockRedis.pexpire).toHaveBeenCalledWith('ratelimit:ip:1.2.3.4', 60_000);
    });

    it('increments without setting expiry on subsequent requests', async () => {
      mockRedis.__setExecResult([
        [null, 5],      // INCR result = 5
        [null, 45_000], // PTTL = 45s remaining
      ]);

      const result = await store.increment('ip:1.2.3.4', 60_000);

      expect(result.count).toBe(5);
      expect(mockRedis.pexpire).not.toHaveBeenCalled();
    });

    it('falls back to in-memory when Redis multi returns null', async () => {
      mockRedis.__setExecResult(null as unknown as [Error | null, unknown][]);
      mockRedis.__multi.exec.mockResolvedValueOnce(null);

      const result = await store.increment('ip:fallback', 60_000);

      expect(result.count).toBe(1);
      expect(result.resetAt).toBeGreaterThan(Date.now() - 1000);
    });

    it('falls back to in-memory when Redis multi returns errors', async () => {
      mockRedis.__setExecResult([
        [new Error('Redis error'), null],
        [null, -2],
      ]);

      const result = await store.increment('ip:error', 60_000);

      expect(result.count).toBe(1);
    });

    it('falls back to in-memory when Redis throws', async () => {
      mockRedis.__multi.exec.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await store.increment('ip:throw', 60_000);

      expect(result.count).toBe(1);
    });

    it('in-memory fallback correctly increments on repeated calls', async () => {
      // First call — Redis throws
      mockRedis.__multi.exec.mockRejectedValueOnce(new Error('down'));
      const r1 = await store.increment('ip:repeat', 60_000);
      expect(r1.count).toBe(1);

      // Second call — Redis throws again
      mockRedis.__multi.exec.mockRejectedValueOnce(new Error('down'));
      const r2 = await store.increment('ip:repeat', 60_000);
      expect(r2.count).toBe(2);
    });

    it('in-memory fallback resets after window expires', async () => {
      jest.useFakeTimers();

      mockRedis.__multi.exec.mockRejectedValue(new Error('down'));

      const r1 = await store.increment('ip:expire', 1000);
      expect(r1.count).toBe(1);

      jest.advanceTimersByTime(1001);

      const r2 = await store.increment('ip:expire', 1000);
      expect(r2.count).toBe(1); // reset

      jest.useRealTimers();
    });
  });

  describe('reset', () => {
    it('deletes the key from Redis', async () => {
      await store.reset('ip:1.2.3.4');
      expect(mockRedis.del).toHaveBeenCalledWith('ratelimit:ip:1.2.3.4');
    });

    it('does not throw when Redis del fails', async () => {
      mockRedis.del.mockRejectedValueOnce(new Error('fail'));
      await expect(store.reset('ip:fail')).resolves.toBeUndefined();
    });
  });

  describe('stopSweep / clear', () => {
    it('stopSweep does not throw', () => {
      expect(() => store.stopSweep()).not.toThrow();
    });

    it('clear does not throw', () => {
      expect(() => store.clear()).not.toThrow();
    });
  });
});

describe('RedisRateLimitStore — integration with rate-limit middleware', () => {
  let mockRedis: MockRedis;

  beforeEach(() => {
    mockRedis = createMockRedis();
    jest.resetModules();
  });

  afterEach(() => {
    // Reset the global redis store
    const { _resetRedisStore, clearRateLimitBuckets } =
      jest.requireActual<typeof import('@src/helpers/middleware/rate-limit.middleware')>(
        '@src/helpers/middleware/rate-limit.middleware',
      );
    _resetRedisStore();
    clearRateLimitBuckets();
  });

  it('middleware uses Redis store when registered', async () => {
    const {
      createRateLimitMiddleware,
      byIp,
      setRedisRateLimitStore,
      _resetRedisStore,
      clearRateLimitBuckets,
    } = await import('@src/helpers/middleware/rate-limit.middleware');
    const { RedisRateLimitStore: StoreClass } = await import(
      '@src/helpers/middleware/redis-rate-limit-store'
    );

    const store = new StoreClass(mockRedis as unknown as Redis);
    setRedisRateLimitStore(store);

    // Simulate Redis returning count=1, pttl=59000
    mockRedis.__setExecResult([
      [null, 1],
      [null, 59_000],
    ]);

    const mw = createRateLimitMiddleware({
      limit: 5,
      windowMs: 60_000,
      keyGenerator: byIp,
    });

    const req = {
      ip: '10.0.0.1',
      socket: { remoteAddress: '10.0.0.1' },
      params: {},
      body: {},
      header: () => undefined,
    } as unknown as Parameters<typeof mw>[0];
    const res = { setHeader: jest.fn() } as unknown as Parameters<typeof mw>[1];
    const next = jest.fn();

    mw(req, res, next);

    // Wait for the async Redis path
    await new Promise(process.nextTick);

    expect(next).toHaveBeenCalledWith();
    expect(mockRedis.multi).toHaveBeenCalled();

    _resetRedisStore();
    clearRateLimitBuckets();
  });
});
