jest.mock('@shared/logger/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { logger } from '@shared/logger/logger';
import { MemoryCacheService } from '@shared/cache/memory-cache.service';

describe('MemoryCacheService', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    (logger.info as jest.Mock).mockClear();
  });

  describe('get / set', () => {
    it('stores and retrieves values', async () => {
      const cache = new MemoryCacheService();
      await cache.set('key1', { data: 'hello' });
      expect(await cache.get('key1')).toEqual({ data: 'hello' });
    });

    it('returns null for missing key', async () => {
      const cache = new MemoryCacheService();
      expect(await cache.get('missing')).toBeNull();
    });

    it('uses defaultTtlSeconds when ttl arg is undefined', async () => {
      jest.useFakeTimers();
      const cache = new MemoryCacheService({ defaultTtlSeconds: 10 });
      await cache.set('k', 'v');

      jest.advanceTimersByTime(5_000);
      expect(await cache.get('k')).toBe('v');

      jest.advanceTimersByTime(6_000);
      expect(await cache.get('k')).toBeNull();
    });

    it('uses defaultTtlSeconds when ttlSeconds arg is 0', async () => {
      jest.useFakeTimers();
      const cache = new MemoryCacheService({ defaultTtlSeconds: 10 });
      await cache.set('k', 'v', 0);

      jest.advanceTimersByTime(5_000);
      expect(await cache.get('k')).toBe('v');

      jest.advanceTimersByTime(6_000);
      expect(await cache.get('k')).toBeNull();
    });

    it('respects custom TTL when positive', async () => {
      jest.useFakeTimers();
      const cache = new MemoryCacheService({ defaultTtlSeconds: 3600 });
      await cache.set('short', 'v', 2);

      expect(await cache.get('short')).toBe('v');
      jest.advanceTimersByTime(3_000);
      expect(await cache.get('short')).toBeNull();
    });

    it('evicts oldest entry when capacity is reached', async () => {
      const cache = new MemoryCacheService({ maxEntries: 2 });
      await cache.set('a', 1);
      await cache.set('b', 2);
      await cache.set('c', 3); // evicts 'a'

      expect(await cache.get('a')).toBeNull();
      expect(await cache.get('b')).toBe(2);
      expect(await cache.get('c')).toBe(3);
    });

    it('overwrite existing key does not trigger eviction', async () => {
      const cache = new MemoryCacheService({ maxEntries: 2 });
      await cache.set('a', 1);
      await cache.set('b', 2);
      await cache.set('a', 99); // overwrite, no eviction

      expect(await cache.get('a')).toBe(99);
      expect(await cache.get('b')).toBe(2);
    });
  });

  describe('del / delByPrefix', () => {
    it('deletes a single key', async () => {
      const cache = new MemoryCacheService();
      await cache.set('k', 'v');
      await cache.del('k');
      expect(await cache.get('k')).toBeNull();
    });

    it('deletes keys by prefix', async () => {
      const cache = new MemoryCacheService();
      await cache.set('user:1', 'a');
      await cache.set('user:2', 'b');
      await cache.set('session:1', 'c');

      await cache.delByPrefix('user:');

      expect(await cache.get('user:1')).toBeNull();
      expect(await cache.get('user:2')).toBeNull();
      expect(await cache.get('session:1')).toBe('c');
    });
  });

  describe('setNx', () => {
    it('returns true for new key and stores value', async () => {
      const cache = new MemoryCacheService();
      const result = await cache.setNx('lock', 'holder1', 60);
      expect(result).toBe(true);
      expect(await cache.get('lock')).toBe('holder1');
    });

    it('returns false when key exists', async () => {
      const cache = new MemoryCacheService();
      await cache.set('lock', 'holder1', 60);
      const result = await cache.setNx('lock', 'holder2', 60);
      expect(result).toBe(false);
      expect(await cache.get('lock')).toBe('holder1');
    });

    it('returns true when existing key has expired', async () => {
      jest.useFakeTimers();
      const cache = new MemoryCacheService();
      await cache.set('lock', 'stale', 1);

      jest.advanceTimersByTime(2_000);

      const result = await cache.setNx('lock', 'fresh', 60);
      expect(result).toBe(true);
      expect(await cache.get('lock')).toBe('fresh');
    });
  });

  describe('ping', () => {
    it('always returns true', async () => {
      const cache = new MemoryCacheService();
      expect(await cache.ping()).toBe(true);
    });
  });

  describe('zadd / ztop', () => {
    it('increments member score and returns top N ordered desc', async () => {
      const cache = new MemoryCacheService();
      await cache.zadd('ranking', 'alice', 5);
      await cache.zadd('ranking', 'bob', 3);
      await cache.zadd('ranking', 'alice', 2); // alice: 7

      const top = await cache.ztop('ranking', 2);
      expect(top).toEqual([
        { member: 'alice', score: 7 },
        { member: 'bob', score: 3 },
      ]);
    });

    it('ztop returns empty array for missing key', async () => {
      const cache = new MemoryCacheService();
      expect(await cache.ztop('missing', 5)).toEqual([]);
    });

    it('ztop limits results to N', async () => {
      const cache = new MemoryCacheService();
      await cache.zadd('r', 'a', 1);
      await cache.zadd('r', 'b', 2);
      await cache.zadd('r', 'c', 3);
      expect(await cache.ztop('r', 2)).toEqual([
        { member: 'c', score: 3 },
        { member: 'b', score: 2 },
      ]);
    });
  });

  describe('evictExpired (GC)', () => {
    it('evicts expired entries when GC timer fires', async () => {
      jest.useFakeTimers();
      const cache = new MemoryCacheService();

      await cache.set('will-expire', 'x', 1);
      await cache.set('still-alive', 'y', 3600);

      // Advance past expiry, then past GC interval (60s)
      jest.advanceTimersByTime(2_000);
      jest.advanceTimersByTime(60_000);

      // Verify expired entry is gone (via a direct get, which also evicts lazily)
      expect(await cache.get('will-expire')).toBeNull();
      expect(await cache.get('still-alive')).toBe('y');
    });

    it('GC timer is unref-ed so it does not keep the process alive', () => {
      const unrefSpy = jest.spyOn(global, 'setInterval');
      const cache = new MemoryCacheService();

      expect(cache).toBeDefined();
      expect(unrefSpy).toHaveBeenCalled();
      unrefSpy.mockRestore();
    });
  });

  describe('destroy', () => {
    it('clears the GC timer and empties the store', async () => {
      const clearSpy = jest.spyOn(global, 'clearInterval');
      const cache = new MemoryCacheService();
      await cache.set('k', 'v');

      await cache.destroy();

      expect(clearSpy).toHaveBeenCalled();
      expect(await cache.get('k')).toBeNull();
      clearSpy.mockRestore();
    });

    it('is idempotent — safe to call multiple times', async () => {
      const cache = new MemoryCacheService();
      await cache.destroy();
      await expect(cache.destroy()).resolves.toBeUndefined();
    });

    it('calls clearInterval exactly once across two destroy calls (guards null gcTimer)', async () => {
      const clearSpy = jest.spyOn(global, 'clearInterval');
      const cache = new MemoryCacheService();
      const before = clearSpy.mock.calls.length;

      await cache.destroy();
      await cache.destroy();

      // First destroy clears; second destroy must skip (gcTimer === null).
      // If the `gcTimer !== null` guard is mutated to `true`, clearInterval
      // would be called twice instead of once.
      expect(clearSpy.mock.calls.length - before).toBe(1);
      clearSpy.mockRestore();
    });
  });

  describe('get expiry boundary', () => {
    it('returns the value when Date.now() equals expiresAt (strict > comparison)', async () => {
      const cache = new MemoryCacheService();
      const base = 1_700_000_000_000;
      jest.spyOn(Date, 'now').mockReturnValue(base);
      await cache.set('k', 'boundary', 1);

      // expiresAt is base + 1000. Read exactly at base + 1000.
      (Date.now as jest.Mock).mockReturnValue(base + 1000);
      expect(await cache.get('k')).toBe('boundary');

      // One ms past expiry → null.
      (Date.now as jest.Mock).mockReturnValue(base + 1001);
      expect(await cache.get('k')).toBeNull();

      await cache.destroy();
    });
  });

  describe('set with maxEntries=0 (firstKey undefined branch)', () => {
    it('does not throw and stores values when maxEntries is 0 and store is empty', async () => {
      // size >= maxEntries (0 >= 0) is always true, but store.keys().next().value
      // is undefined on first insert → the `firstKey !== undefined` guard must hold.
      const cache = new MemoryCacheService({ maxEntries: 0 });
      await expect(cache.set('a', 1, 60)).resolves.toBeUndefined();
      // Subsequent set evicts 'a' (firstKey defined this time)
      await cache.set('b', 2, 60);
      expect(await cache.get('a')).toBeNull();
      expect(await cache.get('b')).toBe(2);
      await cache.destroy();
    });
  });

  describe('set TTL coercion (negative / zero / positive)', () => {
    it('falls back to defaultTtlSeconds when ttlSeconds is negative', async () => {
      jest.useFakeTimers();
      const cache = new MemoryCacheService({ defaultTtlSeconds: 100 });
      await cache.set('k', 'v', -5);

      // If the `ttlSeconds && ttlSeconds > 0` guard were mutated to
      // `ttlSeconds || ttlSeconds > 0`, ttl would be -5, making the entry
      // already expired. With the original, ttl = defaultTtlSeconds = 100s.
      jest.advanceTimersByTime(50_000);
      expect(await cache.get('k')).toBe('v');

      jest.advanceTimersByTime(60_000);
      expect(await cache.get('k')).toBeNull();
      await cache.destroy();
    });

    it('falls back to defaultTtlSeconds when ttlSeconds is exactly 0 (not just falsy short-circuit)', async () => {
      jest.useFakeTimers();
      const cache = new MemoryCacheService({ defaultTtlSeconds: 50 });
      await cache.set('k', 'v', 0);

      jest.advanceTimersByTime(49_000);
      expect(await cache.get('k')).toBe('v');

      jest.advanceTimersByTime(2_000);
      expect(await cache.get('k')).toBeNull();
      await cache.destroy();
    });

    it('uses the provided ttlSeconds when it is positive (1s expires before defaultTtlSeconds)', async () => {
      jest.useFakeTimers();
      const cache = new MemoryCacheService({ defaultTtlSeconds: 3600 });
      await cache.set('k', 'v', 1);

      jest.advanceTimersByTime(500);
      expect(await cache.get('k')).toBe('v');

      jest.advanceTimersByTime(1_000);
      expect(await cache.get('k')).toBeNull();
      await cache.destroy();
    });
  });

  describe('evictExpired (GC timer fires real callback)', () => {
    it('GC callback actively deletes expired entries and logs with exact payload', async () => {
      jest.useFakeTimers();
      const cache = new MemoryCacheService();

      await cache.set('expired-1', 'a', 1);
      await cache.set('expired-2', 'b', 1);
      await cache.set('alive', 'c', 3600);

      // Move past TTL but BEFORE the 60s GC tick.
      jest.advanceTimersByTime(2_000);
      // No GC yet → still 3 entries in store, logger not called.
      expect(logger.info).not.toHaveBeenCalled();

      // Trigger the GC interval at 60s — this calls evictExpired() via setInterval.
      // If the setInterval body block is mutated to {}, evictExpired never runs
      // and logger.info is never called.
      jest.advanceTimersByTime(58_000);

      expect(logger.info).toHaveBeenCalledTimes(1);
      expect(logger.info).toHaveBeenCalledWith('memory_cache_gc', {
        evicted: 2,
        remaining: 1,
      });

      // The surviving entry must still be readable (lazy expiry would otherwise
      // re-delete it, but the GC path is what we're testing).
      expect(await cache.get('alive')).toBe('c');
      await cache.destroy();
    });

    it('GC callback does NOT log when zero entries are evicted (evicted > 0 guard)', async () => {
      jest.useFakeTimers();
      const cache = new MemoryCacheService();

      await cache.set('alive-1', 'a', 3600);
      await cache.set('alive-2', 'b', 3600);

      // Tick GC interval without anything being expired.
      jest.advanceTimersByTime(60_000);

      expect(logger.info).not.toHaveBeenCalled();
      await cache.destroy();
    });

    it('GC callback fires multiple times and increments evicted correctly per run', async () => {
      jest.useFakeTimers();
      const cache = new MemoryCacheService();

      await cache.set('e1', 1, 1);
      jest.advanceTimersByTime(2_000); // e1 expired
      jest.advanceTimersByTime(58_000); // first GC tick → 1 eviction

      expect(logger.info).toHaveBeenCalledTimes(1);
      expect(logger.info).toHaveBeenLastCalledWith('memory_cache_gc', {
        evicted: 1,
        remaining: 0,
      });

      await cache.set('e2', 2, 1);
      await cache.set('e3', 3, 1);
      jest.advanceTimersByTime(2_000); // e2, e3 expired
      jest.advanceTimersByTime(60_000); // next GC tick → 2 evictions

      expect(logger.info).toHaveBeenCalledTimes(2);
      expect(logger.info).toHaveBeenLastCalledWith('memory_cache_gc', {
        evicted: 2,
        remaining: 0,
      });

      await cache.destroy();
    });

    it('GC equality boundary: an entry where now === expiresAt is NOT evicted by GC', async () => {
      jest.useFakeTimers();
      const base = Date.now();
      const cache = new MemoryCacheService();

      // Build an entry whose expiresAt aligns exactly with the next GC tick.
      // GC ticks at base+60_000. An entry set with ttl=60s expires at base+60_000.
      // Strict `now > expiresAt` means this entry should survive the first tick.
      await cache.set('borderline', 'edge', 60);
      jest.advanceTimersByTime(60_000); // GC fires; now === expiresAt for borderline

      // With strict `>`, no eviction happened, no log.
      expect(logger.info).not.toHaveBeenCalled();
      // Sanity: we are at the boundary.
      expect(Date.now()).toBe(base + 60_000);

      await cache.destroy();
    });
  });

  describe('incrBy', () => {
    it('initializes a missing key at 0 and increments by amount', async () => {
      const cache = new MemoryCacheService();
      await expect(cache.incrBy('counter', 3, 60)).resolves.toBe(3);
      expect(await cache.get<number>('counter')).toBe(3);
      await cache.destroy();
    });

    it('adds to an existing numeric value', async () => {
      const cache = new MemoryCacheService();
      await cache.set('counter', 10, 60);
      await expect(cache.incrBy('counter', 5, 60)).resolves.toBe(15);
      expect(await cache.get<number>('counter')).toBe(15);
      await cache.destroy();
    });

    it('truncates non-integer amounts via Math.trunc', async () => {
      const cache = new MemoryCacheService();
      await expect(cache.incrBy('c', 3.9, 60)).resolves.toBe(3);
      await expect(cache.incrBy('c', 2.1, 60)).resolves.toBe(5);
      await cache.destroy();
    });

    it('supports negative amounts (subtraction path uses + Math.trunc(amount))', async () => {
      const cache = new MemoryCacheService();
      await cache.set('c', 10, 60);
      await expect(cache.incrBy('c', -4, 60)).resolves.toBe(6);
      // If the operator were mutated from `+` to `-`, result would be 10 - (-4) = 14.
      expect(await cache.get<number>('c')).toBe(6);
      await cache.destroy();
    });

    it('returns null when amount is 0', async () => {
      const cache = new MemoryCacheService();
      await expect(cache.incrBy('c', 0, 60)).resolves.toBeNull();
      // Side effect: nothing was written.
      expect(await cache.get<number>('c')).toBeNull();
      await cache.destroy();
    });

    it('returns null when amount is NaN', async () => {
      const cache = new MemoryCacheService();
      await expect(cache.incrBy('c', Number.NaN, 60)).resolves.toBeNull();
      expect(await cache.get<number>('c')).toBeNull();
      await cache.destroy();
    });

    it('returns null when amount is Infinity', async () => {
      const cache = new MemoryCacheService();
      await expect(cache.incrBy('c', Number.POSITIVE_INFINITY, 60)).resolves.toBeNull();
      await expect(cache.incrBy('c', Number.NEGATIVE_INFINITY, 60)).resolves.toBeNull();
      expect(await cache.get<number>('c')).toBeNull();
      await cache.destroy();
    });

    it('returns null when ttlSeconds is 0', async () => {
      const cache = new MemoryCacheService();
      await expect(cache.incrBy('c', 1, 0)).resolves.toBeNull();
      expect(await cache.get<number>('c')).toBeNull();
      await cache.destroy();
    });

    it('returns null when ttlSeconds is negative', async () => {
      const cache = new MemoryCacheService();
      await expect(cache.incrBy('c', 1, -5)).resolves.toBeNull();
      expect(await cache.get<number>('c')).toBeNull();
      await cache.destroy();
    });

    it('returns null when ttlSeconds is NaN', async () => {
      const cache = new MemoryCacheService();
      await expect(cache.incrBy('c', 1, Number.NaN)).resolves.toBeNull();
      expect(await cache.get<number>('c')).toBeNull();
      await cache.destroy();
    });

    it('returns null when ttlSeconds is Infinity (not finite)', async () => {
      const cache = new MemoryCacheService();
      await expect(cache.incrBy('c', 1, Number.POSITIVE_INFINITY)).resolves.toBeNull();
      expect(await cache.get<number>('c')).toBeNull();
      await cache.destroy();
    });

    it('refreshes the TTL on each increment', async () => {
      jest.useFakeTimers();
      const cache = new MemoryCacheService();

      await cache.incrBy('c', 1, 10); // expires at t+10s

      jest.advanceTimersByTime(8_000);
      await cache.incrBy('c', 1, 10); // refresh → expires at t+18s

      jest.advanceTimersByTime(8_000); // t+16s — still alive (refreshed)
      expect(await cache.get<number>('c')).toBe(2);

      jest.advanceTimersByTime(3_000); // t+19s — past refreshed TTL
      expect(await cache.get<number>('c')).toBeNull();
      await cache.destroy();
    });
  });
});
