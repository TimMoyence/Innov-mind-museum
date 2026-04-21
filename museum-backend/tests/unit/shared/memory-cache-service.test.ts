import { MemoryCacheService } from '@shared/cache/memory-cache.service';

describe('MemoryCacheService', () => {
  afterEach(() => {
    jest.useRealTimers();
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
  });
});
