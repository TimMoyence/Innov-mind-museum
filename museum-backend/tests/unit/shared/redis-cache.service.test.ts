/**
 * Supplementary tests for RedisCacheService.
 * Core coverage lives in redis-cache-service.test.ts — these tests cover
 * integration-style round trips using an in-memory store mock.
 */
jest.mock('ioredis', () => {
  const store = new Map<string, { value: string; ttl: number }>();

  return jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    quit: jest.fn().mockResolvedValue('OK'),
    get: jest.fn((key: string) => {
      const entry = store.get(key);
      return Promise.resolve(entry ? entry.value : null);
    }),
    set: jest.fn((...args: unknown[]) => {
      const key = args[0] as string;
      const value = args[1] as string;
      const hasNx = args.includes('NX');
      if (hasNx && store.has(key)) {
        return Promise.resolve(null);
      }
      const exIndex = args.indexOf('EX');
      const ttl = exIndex !== -1 ? (args[exIndex + 1] as number) : 0;
      store.set(key, { value, ttl });
      return Promise.resolve('OK');
    }),
    del: jest.fn((...keys: string[]) => {
      let count = 0;
      for (const k of keys) {
        if (store.delete(k)) count++;
      }
      return Promise.resolve(count);
    }),
    scan: jest.fn((cursor: string, _match: string, pattern: string) => {
      if (cursor === '0') {
        const prefix = pattern.replace('*', '');
        const matchingKeys = [...store.keys()].filter((k) => k.startsWith(prefix));
        return Promise.resolve(['0', matchingKeys]);
      }
      return Promise.resolve(['0', []]);
    }),
    ping: jest.fn().mockResolvedValue('PONG'),
    _store: store,
  }));
});

import { RedisCacheService } from '@shared/cache/redis-cache.service';

function getRedisInstance() {
  const Redis = require('ioredis');
  return Redis.mock.results[Redis.mock.results.length - 1].value;
}

describe('RedisCacheService — round-trip integration', () => {
  let cache: RedisCacheService;

  beforeEach(() => {
    const Redis = require('ioredis');
    Redis.mockClear();
    cache = new RedisCacheService({ url: 'redis://localhost:6379', defaultTtlSeconds: 60 });
    getRedisInstance()._store.clear();
  });

  it('get → set → get → del → get full lifecycle', async () => {
    expect(await cache.get('lifecycle')).toBeNull();
    await cache.set('lifecycle', { step: 1 });
    expect(await cache.get<{ step: number }>('lifecycle')).toEqual({ step: 1 });
    await cache.del('lifecycle');
    expect(await cache.get('lifecycle')).toBeNull();
  });

  it('setNx acquires then blocks a second caller', async () => {
    const first = await cache.setNx('mutex', 'owner-a', 10);
    const second = await cache.setNx('mutex', 'owner-b', 10);
    expect(first).toBe(true);
    expect(second).toBe(false);
    // Value is still the first owner's
    expect(await cache.get<string>('mutex')).toBe('owner-a');
  });

  it('delByPrefix removes only matching keys', async () => {
    await cache.set('ns:a:1', 'x');
    await cache.set('ns:a:2', 'y');
    await cache.set('ns:b:1', 'z');

    await cache.delByPrefix('ns:a:');

    expect(await cache.get('ns:a:1')).toBeNull();
    expect(await cache.get('ns:a:2')).toBeNull();
    expect(await cache.get<string>('ns:b:1')).toBe('z');
  });

  it('set records correct TTL argument', async () => {
    await cache.set('ttl-check', 'data', 3600);
    const redis = getRedisInstance();
    expect(redis.set).toHaveBeenCalledWith('ttl-check', '"data"', 'EX', 3600);
  });
});
