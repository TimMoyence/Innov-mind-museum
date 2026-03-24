import type { CacheService } from '@shared/cache/cache.port';
import { NoopCacheService } from '@shared/cache/noop-cache.service';
import { InMemoryCacheService } from 'tests/helpers/cache/inMemoryCacheService';

describe('NoopCacheService', () => {
  // Cast to CacheService interface since Noop declares params-less signatures
  const cache: CacheService = new NoopCacheService();

  it('get always returns null', async () => {
    expect(await cache.get('any-key')).toBeNull();
  });

  it('set is a no-op', async () => {
    await expect(cache.set('key', 'value')).resolves.toBeUndefined();
  });

  it('del is a no-op', async () => {
    await expect(cache.del('key')).resolves.toBeUndefined();
  });

  it('delByPrefix is a no-op', async () => {
    await expect(cache.delByPrefix('prefix:')).resolves.toBeUndefined();
  });

  it('setNx always returns true', async () => {
    expect(await cache.setNx('key', 'val', 60)).toBe(true);
  });
});

describe('InMemoryCacheService', () => {
  it('stores and retrieves values', async () => {
    const cache = new InMemoryCacheService();
    await cache.set('key1', { data: 'hello' });
    expect(await cache.get('key1')).toEqual({ data: 'hello' });
  });

  it('returns null for non-existent key', async () => {
    const cache = new InMemoryCacheService();
    expect(await cache.get('missing')).toBeNull();
  });

  it('deletes a key', async () => {
    const cache = new InMemoryCacheService();
    await cache.set('key1', 'val');
    await cache.del('key1');
    expect(await cache.get('key1')).toBeNull();
  });

  it('deletes keys by prefix', async () => {
    const cache = new InMemoryCacheService();
    await cache.set('session:1:data', 'a');
    await cache.set('session:1:list', 'b');
    await cache.set('session:2:data', 'c');
    await cache.delByPrefix('session:1:');
    expect(await cache.get('session:1:data')).toBeNull();
    expect(await cache.get('session:1:list')).toBeNull();
    expect(await cache.get('session:2:data')).toBe('c');
  });

  it('respects TTL — expired entries return null', async () => {
    jest.useFakeTimers();
    const cache = new InMemoryCacheService();
    await cache.set('ttl-key', 'value', 5);

    expect(await cache.get('ttl-key')).toBe('value');

    jest.advanceTimersByTime(6_000);
    expect(await cache.get('ttl-key')).toBeNull();

    jest.useRealTimers();
  });

  it('stores without TTL (no expiry)', async () => {
    const cache = new InMemoryCacheService();
    await cache.set('forever', 'data');
    expect(await cache.get('forever')).toBe('data');
  });

  it('setNx returns true for new key', async () => {
    const cache = new InMemoryCacheService();
    const result = await cache.setNx('lock', 'holder', 60);
    expect(result).toBe(true);
    expect(await cache.get('lock')).toBe('holder');
  });

  it('setNx returns false when key already exists and not expired', async () => {
    const cache = new InMemoryCacheService();
    await cache.set('lock', 'first', 60);
    const result = await cache.setNx('lock', 'second', 60);
    expect(result).toBe(false);
    expect(await cache.get('lock')).toBe('first');
  });

  it('setNx succeeds when existing key has expired', async () => {
    jest.useFakeTimers();
    const cache = new InMemoryCacheService();
    await cache.set('lock', 'first', 1);

    jest.advanceTimersByTime(2_000);

    const result = await cache.setNx('lock', 'second', 60);
    expect(result).toBe(true);
    expect(await cache.get('lock')).toBe('second');

    jest.useRealTimers();
  });

  it('has returns true for existing key', async () => {
    const cache = new InMemoryCacheService();
    await cache.set('exists', 'val');
    expect(cache.has('exists')).toBe(true);
    expect(cache.has('missing')).toBe(false);
  });

  it('clear removes all entries', async () => {
    const cache = new InMemoryCacheService();
    await cache.set('a', 1);
    await cache.set('b', 2);
    cache.clear();
    expect(await cache.get('a')).toBeNull();
    expect(await cache.get('b')).toBeNull();
  });
});
