jest.mock('@shared/logger/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { logger } from '@shared/logger/logger';

import { ResilientCacheWrapper } from '@shared/cache/resilient-cache.wrapper';

import type { CacheService } from '@shared/cache/cache.port';

const warnMock = logger.warn as jest.Mock;

const makeFailingInner = (error: unknown): CacheService => ({
  get: jest.fn().mockRejectedValue(error),
  set: jest.fn().mockRejectedValue(error),
  del: jest.fn().mockRejectedValue(error),
  delByPrefix: jest.fn().mockRejectedValue(error),
  setNx: jest.fn().mockRejectedValue(error),
  incrBy: jest.fn().mockRejectedValue(error),
  ping: jest.fn().mockRejectedValue(error),
  zadd: jest.fn().mockRejectedValue(error),
  ztop: jest.fn().mockRejectedValue(error),
  destroy: jest.fn().mockRejectedValue(error),
});

const makeSuccessfulInner = (): CacheService => ({
  get: jest.fn().mockResolvedValue('value'),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
  delByPrefix: jest.fn().mockResolvedValue(undefined),
  setNx: jest.fn().mockResolvedValue(true),
  incrBy: jest.fn().mockResolvedValue(42),
  ping: jest.fn().mockResolvedValue(true),
  zadd: jest.fn().mockResolvedValue(undefined),
  ztop: jest.fn().mockResolvedValue([{ member: 'a', score: 1 }]),
  destroy: jest.fn().mockResolvedValue(undefined),
});

describe('ResilientCacheWrapper', () => {
  beforeEach(() => {
    warnMock.mockClear();
  });

  describe('when inner cache always throws (Redis unreachable)', () => {
    const err = new Error('ECONNREFUSED 127.0.0.1:6379');
    let inner: CacheService;
    let wrapper: ResilientCacheWrapper;

    beforeEach(() => {
      inner = makeFailingInner(err);
      wrapper = new ResilientCacheWrapper(inner);
    });

    it('get returns null and logs cache_get_failed with key+error', async () => {
      await expect(wrapper.get('k1')).resolves.toBeNull();
      // Wrapper forwards key + (undefined) schema to inner.get<T>(key, schema?)
      expect(inner.get).toHaveBeenCalledWith('k1', undefined);
      expect(warnMock).toHaveBeenCalledTimes(1);
      expect(warnMock).toHaveBeenCalledWith('cache_get_failed', {
        key: 'k1',
        error: 'ECONNREFUSED 127.0.0.1:6379',
      });
    });

    it('set swallows the error and logs cache_set_failed with key+error', async () => {
      await expect(wrapper.set('k2', 'v', 60)).resolves.toBeUndefined();
      expect(inner.set).toHaveBeenCalledWith('k2', 'v', 60);
      expect(warnMock).toHaveBeenCalledTimes(1);
      expect(warnMock).toHaveBeenCalledWith('cache_set_failed', {
        key: 'k2',
        error: 'ECONNREFUSED 127.0.0.1:6379',
      });
    });

    it('del swallows the error and logs cache_del_failed with key+error', async () => {
      await expect(wrapper.del('k3')).resolves.toBeUndefined();
      expect(inner.del).toHaveBeenCalledWith('k3');
      expect(warnMock).toHaveBeenCalledTimes(1);
      expect(warnMock).toHaveBeenCalledWith('cache_del_failed', {
        key: 'k3',
        error: 'ECONNREFUSED 127.0.0.1:6379',
      });
    });

    it('delByPrefix swallows the error and logs cache_del_prefix_failed with prefix+error', async () => {
      await expect(wrapper.delByPrefix('prefix:')).resolves.toBeUndefined();
      expect(inner.delByPrefix).toHaveBeenCalledWith('prefix:');
      expect(warnMock).toHaveBeenCalledTimes(1);
      expect(warnMock).toHaveBeenCalledWith('cache_del_prefix_failed', {
        key: 'prefix:',
        error: 'ECONNREFUSED 127.0.0.1:6379',
      });
    });

    it('setNx returns false and logs cache_setnx_failed with key+error', async () => {
      await expect(wrapper.setNx('k4', 'v', 60)).resolves.toBe(false);
      expect(inner.setNx).toHaveBeenCalledWith('k4', 'v', 60);
      expect(warnMock).toHaveBeenCalledTimes(1);
      expect(warnMock).toHaveBeenCalledWith('cache_setnx_failed', {
        key: 'k4',
        error: 'ECONNREFUSED 127.0.0.1:6379',
      });
    });

    it('incrBy returns null and logs cache_incrby_failed with key+error', async () => {
      await expect(wrapper.incrBy('k5', 1, 60)).resolves.toBeNull();
      expect(inner.incrBy).toHaveBeenCalledWith('k5', 1, 60);
      expect(warnMock).toHaveBeenCalledTimes(1);
      expect(warnMock).toHaveBeenCalledWith('cache_incrby_failed', {
        key: 'k5',
        error: 'ECONNREFUSED 127.0.0.1:6379',
      });
    });

    it('ping returns false and logs cache_ping_failed with empty key+error', async () => {
      await expect(wrapper.ping()).resolves.toBe(false);
      expect(inner.ping).toHaveBeenCalledTimes(1);
      expect(warnMock).toHaveBeenCalledTimes(1);
      expect(warnMock).toHaveBeenCalledWith('cache_ping_failed', {
        key: '',
        error: 'ECONNREFUSED 127.0.0.1:6379',
      });
    });

    it('zadd swallows the error and logs cache_zadd_failed with key+error', async () => {
      await expect(wrapper.zadd('k6', 'member', 1)).resolves.toBeUndefined();
      expect(inner.zadd).toHaveBeenCalledWith('k6', 'member', 1);
      expect(warnMock).toHaveBeenCalledTimes(1);
      expect(warnMock).toHaveBeenCalledWith('cache_zadd_failed', {
        key: 'k6',
        error: 'ECONNREFUSED 127.0.0.1:6379',
      });
    });

    it('ztop returns [] and logs cache_ztop_failed with key+error', async () => {
      await expect(wrapper.ztop('k7', 5)).resolves.toEqual([]);
      expect(inner.ztop).toHaveBeenCalledWith('k7', 5);
      expect(warnMock).toHaveBeenCalledTimes(1);
      expect(warnMock).toHaveBeenCalledWith('cache_ztop_failed', {
        key: 'k7',
        error: 'ECONNREFUSED 127.0.0.1:6379',
      });
    });

    it('destroy swallows the error and logs cache_destroy_failed with empty key+error', async () => {
      await expect(wrapper.destroy()).resolves.toBeUndefined();
      expect(inner.destroy).toHaveBeenCalledTimes(1);
      expect(warnMock).toHaveBeenCalledTimes(1);
      expect(warnMock).toHaveBeenCalledWith('cache_destroy_failed', {
        key: '',
        error: 'ECONNREFUSED 127.0.0.1:6379',
      });
    });
  });

  describe('when inner cache succeeds', () => {
    let inner: CacheService;
    let wrapper: ResilientCacheWrapper;

    beforeEach(() => {
      inner = makeSuccessfulInner();
      wrapper = new ResilientCacheWrapper(inner);
    });

    it('passes through get values without logging', async () => {
      await expect(wrapper.get<string>('k')).resolves.toBe('value');
      // Wrapper forwards key + (undefined) schema to inner.get<T>(key, schema?)
      expect(inner.get).toHaveBeenCalledWith('k', undefined);
      expect(warnMock).not.toHaveBeenCalled();
    });

    it('passes through set with TTL without logging', async () => {
      await wrapper.set('k', 'v', 60);
      expect(inner.set).toHaveBeenCalledWith('k', 'v', 60);
      expect(warnMock).not.toHaveBeenCalled();
    });

    it('passes through set without TTL', async () => {
      await wrapper.set('k', 'v');
      expect(inner.set).toHaveBeenCalledWith('k', 'v', undefined);
      expect(warnMock).not.toHaveBeenCalled();
    });

    it('passes through del without logging', async () => {
      await wrapper.del('k');
      expect(inner.del).toHaveBeenCalledWith('k');
      expect(warnMock).not.toHaveBeenCalled();
    });

    it('passes through delByPrefix without logging', async () => {
      await wrapper.delByPrefix('prefix:');
      expect(inner.delByPrefix).toHaveBeenCalledWith('prefix:');
      expect(warnMock).not.toHaveBeenCalled();
    });

    it('passes through setNx result without logging', async () => {
      await expect(wrapper.setNx('k', 'v', 60)).resolves.toBe(true);
      expect(inner.setNx).toHaveBeenCalledWith('k', 'v', 60);
      expect(warnMock).not.toHaveBeenCalled();
    });

    it('passes through incrBy result without logging', async () => {
      await expect(wrapper.incrBy('k', 3, 60)).resolves.toBe(42);
      expect(inner.incrBy).toHaveBeenCalledWith('k', 3, 60);
      expect(warnMock).not.toHaveBeenCalled();
    });

    it('passes through ping result without logging', async () => {
      await expect(wrapper.ping()).resolves.toBe(true);
      expect(inner.ping).toHaveBeenCalledTimes(1);
      expect(warnMock).not.toHaveBeenCalled();
    });

    it('passes through zadd without logging', async () => {
      await wrapper.zadd('k', 'm', 2);
      expect(inner.zadd).toHaveBeenCalledWith('k', 'm', 2);
      expect(warnMock).not.toHaveBeenCalled();
    });

    it('passes through ztop result without logging', async () => {
      await expect(wrapper.ztop('k', 5)).resolves.toEqual([{ member: 'a', score: 1 }]);
      expect(inner.ztop).toHaveBeenCalledWith('k', 5);
      expect(warnMock).not.toHaveBeenCalled();
    });

    it('passes through destroy without logging', async () => {
      await wrapper.destroy();
      expect(inner.destroy).toHaveBeenCalledTimes(1);
      expect(warnMock).not.toHaveBeenCalled();
    });
  });

  it('handles inner cache without destroy() method (optional chaining)', async () => {
    const inner = makeSuccessfulInner();
    delete (inner as { destroy?: unknown }).destroy;
    const wrapper = new ResilientCacheWrapper(inner);
    await expect(wrapper.destroy()).resolves.toBeUndefined();
    expect(warnMock).not.toHaveBeenCalled();
  });

  it('serialises non-Error thrown values via String(err) (get path)', async () => {
    const inner: CacheService = {
      ...makeSuccessfulInner(),
      get: jest.fn().mockRejectedValue('string-error'),
    };
    const wrapper = new ResilientCacheWrapper(inner);
    await expect(wrapper.get('k')).resolves.toBeNull();
    expect(warnMock).toHaveBeenCalledWith('cache_get_failed', {
      key: 'k',
      error: 'string-error',
    });
  });

  it('serialises non-Error thrown values via String(err) (numeric)', async () => {
    const inner: CacheService = {
      ...makeSuccessfulInner(),
      ping: jest.fn().mockRejectedValue(42),
    };
    const wrapper = new ResilientCacheWrapper(inner);
    await expect(wrapper.ping()).resolves.toBe(false);
    expect(warnMock).toHaveBeenCalledWith('cache_ping_failed', {
      key: '',
      error: '42',
    });
  });
});
