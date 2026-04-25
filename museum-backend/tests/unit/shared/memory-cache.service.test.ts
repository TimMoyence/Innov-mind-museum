import { MemoryCacheService } from '@shared/cache/memory-cache.service';

describe('MemoryCacheService', () => {
  let cache: MemoryCacheService;

  afterEach(async () => {
    await cache.destroy();
    jest.useRealTimers();
  });

  describe('get / set', () => {
    it('returns null on miss', async () => {
      cache = new MemoryCacheService();
      expect(await cache.get('absent')).toBeNull();
    });

    it('returns value within TTL', async () => {
      cache = new MemoryCacheService();
      await cache.set('k', { n: 1 }, 10);
      expect(await cache.get('k')).toEqual({ n: 1 });
    });

    it('returns null once TTL has elapsed and removes the entry', async () => {
      jest.useFakeTimers();
      cache = new MemoryCacheService();
      await cache.set('k', 'v', 1);
      jest.advanceTimersByTime(1500);
      expect(await cache.get('k')).toBeNull();
    });

    it('falls back to defaultTtlSeconds when ttl is 0 or negative', async () => {
      cache = new MemoryCacheService({ defaultTtlSeconds: 5 });
      await cache.set('k', 'v', 0);
      expect(await cache.get('k')).toBe('v');
    });
  });

  describe('capacity eviction', () => {
    it('evicts the oldest entry when maxEntries is reached and a new key is inserted', async () => {
      cache = new MemoryCacheService({ maxEntries: 2 });
      await cache.set('a', 1);
      await cache.set('b', 2);
      await cache.set('c', 3); // evicts 'a'
      expect(await cache.get('a')).toBeNull();
      expect(await cache.get('b')).toBe(2);
      expect(await cache.get('c')).toBe(3);
    });

    it('overwriting an existing key does not trigger eviction', async () => {
      cache = new MemoryCacheService({ maxEntries: 2 });
      await cache.set('a', 1);
      await cache.set('b', 2);
      await cache.set('a', 11); // overwrite
      expect(await cache.get('a')).toBe(11);
      expect(await cache.get('b')).toBe(2);
    });
  });

  describe('del / delByPrefix', () => {
    it('del removes a single key', async () => {
      cache = new MemoryCacheService();
      await cache.set('a', 1);
      await cache.del('a');
      expect(await cache.get('a')).toBeNull();
    });

    it('delByPrefix removes every matching key', async () => {
      cache = new MemoryCacheService();
      await cache.set('user:1', 'a');
      await cache.set('user:2', 'b');
      await cache.set('other:1', 'c');
      await cache.delByPrefix('user:');
      expect(await cache.get('user:1')).toBeNull();
      expect(await cache.get('user:2')).toBeNull();
      expect(await cache.get('other:1')).toBe('c');
    });
  });

  describe('setNx', () => {
    it('writes when key absent and returns true', async () => {
      cache = new MemoryCacheService();
      const ok = await cache.setNx('lock', 'me', 10);
      expect(ok).toBe(true);
      expect(await cache.get('lock')).toBe('me');
    });

    it('refuses write when key present and returns false', async () => {
      cache = new MemoryCacheService();
      await cache.set('lock', 'first', 10);
      const ok = await cache.setNx('lock', 'second', 10);
      expect(ok).toBe(false);
      expect(await cache.get('lock')).toBe('first');
    });
  });

  describe('ping', () => {
    it('always returns true', async () => {
      cache = new MemoryCacheService();
      expect(await cache.ping()).toBe(true);
    });
  });

  describe('zadd / ztop', () => {
    it('zadd accumulates increments for a member', async () => {
      cache = new MemoryCacheService();
      await cache.zadd('rank', 'a', 3);
      await cache.zadd('rank', 'a', 2);
      await cache.zadd('rank', 'b', 10);
      const top = await cache.ztop('rank', 2);
      expect(top).toEqual([
        { member: 'b', score: 10 },
        { member: 'a', score: 5 },
      ]);
    });

    it('ztop returns empty array when key absent', async () => {
      cache = new MemoryCacheService();
      expect(await cache.ztop('never', 5)).toEqual([]);
    });

    it('ztop respects the n slice', async () => {
      cache = new MemoryCacheService();
      await cache.zadd('rank', 'a', 1);
      await cache.zadd('rank', 'b', 2);
      await cache.zadd('rank', 'c', 3);
      const top = await cache.ztop('rank', 2);
      expect(top.length).toBe(2);
      expect(top[0].member).toBe('c');
    });
  });

  describe('destroy', () => {
    it('clears the store and is idempotent', async () => {
      cache = new MemoryCacheService();
      await cache.set('a', 1);
      await cache.destroy();
      expect(await cache.get('a')).toBeNull();
      await cache.destroy(); // second call must not throw
    });
  });

  describe('GC', () => {
    it('evictExpired (invoked via setInterval) purges expired entries', async () => {
      jest.useFakeTimers();
      cache = new MemoryCacheService();
      await cache.set('short', 'x', 1);
      await cache.set('long', 'y', 3600);
      jest.advanceTimersByTime(2_000); // past short TTL
      jest.advanceTimersByTime(60_000); // trigger the GC interval
      expect(await cache.get('short')).toBeNull();
      expect(await cache.get('long')).toBe('y');
    });
  });
});
