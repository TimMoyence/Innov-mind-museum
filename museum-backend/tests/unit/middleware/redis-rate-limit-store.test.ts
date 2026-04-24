import type Redis from 'ioredis';
import { RedisRateLimitStore } from '@src/helpers/middleware/redis-rate-limit-store';
import {
  makePartialRequest,
  makePartialResponse,
  makeNext,
} from '../../helpers/http/express-mock.helpers';

interface MockRedis {
  eval: jest.Mock;
  del: jest.Mock;
  on: jest.Mock;
}

/**
 * Exposes the mock in the Redis shape expected by RedisRateLimitStore. Single cast.
 * @param m
 */
const asRedis = (m: MockRedis): Redis => m as unknown as Redis;

/** Creates a mock ioredis client exposing the minimal surface the store uses. */
const createMockRedis = (): MockRedis => {
  return {
    eval: jest.fn(async () => [1, 60_000]),
    del: jest.fn(async () => 1),
    on: jest.fn().mockReturnThis(),
  };
};

describe('RedisRateLimitStore', () => {
  let mockRedis: MockRedis;
  let store: RedisRateLimitStore;

  beforeEach(() => {
    mockRedis = createMockRedis();
    store = new RedisRateLimitStore(asRedis(mockRedis));
  });

  afterEach(() => {
    store.clear();
  });

  describe('increment', () => {
    it('returns atomic Lua result for first request (count=1)', async () => {
      mockRedis.eval.mockResolvedValueOnce([1, 60_000]);

      const result = await store.increment('ip:1.2.3.4', 60_000);

      expect(result.count).toBe(1);
      expect(result.resetAt).toBeGreaterThan(Date.now() - 1000);
      expect(result.resetAt).toBeLessThanOrEqual(Date.now() + 60_000 + 100);
      expect(mockRedis.eval).toHaveBeenCalledTimes(1);
      const [, numKeys, key, windowArg] = mockRedis.eval.mock.calls[0];
      expect(numKeys).toBe(1);
      expect(key).toBe('ratelimit:ip:1.2.3.4');
      expect(windowArg).toBe('60000');
    });

    it('returns atomic Lua result for subsequent requests', async () => {
      mockRedis.eval.mockResolvedValueOnce([5, 45_000]);

      const result = await store.increment('ip:1.2.3.4', 60_000);

      expect(result.count).toBe(5);
      expect(result.resetAt).toBeGreaterThan(Date.now());
      expect(result.resetAt).toBeLessThanOrEqual(Date.now() + 45_000 + 100);
    });

    it('falls back to in-memory when Redis EVAL throws', async () => {
      mockRedis.eval.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await store.increment('ip:throw', 60_000);

      expect(result.count).toBe(1);
    });

    it('in-memory fallback correctly increments on repeated calls', async () => {
      mockRedis.eval.mockRejectedValueOnce(new Error('down'));
      const r1 = await store.increment('ip:repeat', 60_000);
      expect(r1.count).toBe(1);

      mockRedis.eval.mockRejectedValueOnce(new Error('down'));
      const r2 = await store.increment('ip:repeat', 60_000);
      expect(r2.count).toBe(2);
    });

    it('in-memory fallback resets after window expires', async () => {
      jest.useFakeTimers();

      mockRedis.eval.mockRejectedValue(new Error('down'));

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
      expect(() => {
        store.stopSweep();
      }).not.toThrow();
    });

    it('clear does not throw', () => {
      expect(() => {
        store.clear();
      }).not.toThrow();
    });
  });

  describe('getRedisClient', () => {
    it('returns the underlying ioredis client', () => {
      expect(store.getRedisClient()).toBe(asRedis(mockRedis));
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
    const { _resetRedisStore, clearRateLimitBuckets } = jest.requireActual<
      typeof import('@src/helpers/middleware/rate-limit.middleware')
    >('@src/helpers/middleware/rate-limit.middleware');
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
    const { RedisRateLimitStore: StoreClass } =
      await import('@src/helpers/middleware/redis-rate-limit-store');

    const store = new StoreClass(asRedis(mockRedis));
    setRedisRateLimitStore(store);

    mockRedis.eval.mockResolvedValueOnce([1, 59_000]);

    const mw = createRateLimitMiddleware({
      limit: 5,
      windowMs: 60_000,
      keyGenerator: byIp,
    });

    const req = makePartialRequest({ ip: '10.0.0.1', socket: { remoteAddress: '10.0.0.1' } });
    const res = makePartialResponse();
    const next = makeNext();

    mw(req, res, next);

    // Wait for the async Redis path
    await new Promise(process.nextTick);

    expect(next).toHaveBeenCalledWith();
    expect(mockRedis.eval).toHaveBeenCalled();

    _resetRedisStore();
    clearRateLimitBuckets();
  });
});
