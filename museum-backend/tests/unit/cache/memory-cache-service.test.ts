jest.mock('@shared/logger/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { MemoryCacheService } from '@shared/cache/memory-cache.service';

describe('MemoryCacheService', () => {
  let cache: MemoryCacheService;

  afterEach(async () => {
    await cache?.destroy();
  });

  it('round-trips a value via get/set', async () => {
    cache = new MemoryCacheService();
    await cache.set('k', 'v', 60);
    await expect(cache.get<string>('k')).resolves.toBe('v');
  });

  it('returns null for a missing key', async () => {
    cache = new MemoryCacheService();
    await expect(cache.get('missing')).resolves.toBeNull();
  });

  it('expires a value after the TTL elapses', async () => {
    cache = new MemoryCacheService();
    await cache.set('k', 'v', 1);
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now + 2000);
    try {
      await expect(cache.get('k')).resolves.toBeNull();
    } finally {
      (Date.now as jest.Mock).mockRestore();
    }
  });

  it('uses defaultTtlSeconds when ttl arg is missing or zero', async () => {
    cache = new MemoryCacheService({ defaultTtlSeconds: 60 });
    await cache.set('k', 'v');
    await expect(cache.get<string>('k')).resolves.toBe('v');
    await cache.set('k2', 'v2', 0);
    await expect(cache.get<string>('k2')).resolves.toBe('v2');
  });

  it('evicts the oldest entry when at capacity', async () => {
    cache = new MemoryCacheService({ maxEntries: 2 });
    await cache.set('a', 1, 60);
    await cache.set('b', 2, 60);
    await cache.set('c', 3, 60); // evicts "a"
    await expect(cache.get('a')).resolves.toBeNull();
    await expect(cache.get<number>('b')).resolves.toBe(2);
    await expect(cache.get<number>('c')).resolves.toBe(3);
  });

  it('overwrites an existing key without evicting', async () => {
    cache = new MemoryCacheService({ maxEntries: 1 });
    await cache.set('a', 1, 60);
    await cache.set('a', 2, 60);
    await expect(cache.get<number>('a')).resolves.toBe(2);
  });

  it('deletes a single key', async () => {
    cache = new MemoryCacheService();
    await cache.set('k', 'v', 60);
    await cache.del('k');
    await expect(cache.get('k')).resolves.toBeNull();
  });

  it('deletes by prefix', async () => {
    cache = new MemoryCacheService();
    await cache.set('foo:a', 1, 60);
    await cache.set('foo:b', 2, 60);
    await cache.set('bar:a', 3, 60);
    await cache.delByPrefix('foo:');
    await expect(cache.get('foo:a')).resolves.toBeNull();
    await expect(cache.get('foo:b')).resolves.toBeNull();
    await expect(cache.get<number>('bar:a')).resolves.toBe(3);
  });

  it('setNx writes when absent and refuses when present', async () => {
    cache = new MemoryCacheService();
    await expect(cache.setNx('k', 'first', 60)).resolves.toBe(true);
    await expect(cache.setNx('k', 'second', 60)).resolves.toBe(false);
    await expect(cache.get<string>('k')).resolves.toBe('first');
  });

  it('ping always returns true', async () => {
    cache = new MemoryCacheService();
    await expect(cache.ping()).resolves.toBe(true);
  });

  it('zadd / ztop returns top-N members by score descending', async () => {
    cache = new MemoryCacheService();
    await cache.zadd('leaderboard', 'a', 1);
    await cache.zadd('leaderboard', 'b', 5);
    await cache.zadd('leaderboard', 'c', 3);
    await cache.zadd('leaderboard', 'a', 10); // a now 11

    const top = await cache.ztop('leaderboard', 2);
    expect(top).toEqual([
      { member: 'a', score: 11 },
      { member: 'b', score: 5 },
    ]);
  });

  it('ztop returns empty array for an unknown sorted set', async () => {
    cache = new MemoryCacheService();
    await expect(cache.ztop('nope', 5)).resolves.toEqual([]);
  });

  it('destroy clears the store and is safe to call twice', async () => {
    cache = new MemoryCacheService();
    await cache.set('k', 'v', 60);
    await cache.destroy();
    await cache.destroy();
    await expect(cache.get('k')).resolves.toBeNull();
  });
});
