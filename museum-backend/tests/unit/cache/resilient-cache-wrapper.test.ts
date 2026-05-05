jest.mock('@shared/logger/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { ResilientCacheWrapper } from '@shared/cache/resilient-cache.wrapper';

import type { CacheService } from '@shared/cache/cache.port';

const makeFailingInner = (error: Error): CacheService => ({
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
  describe('when inner cache always throws (Redis unreachable)', () => {
    const err = new Error('ECONNREFUSED 127.0.0.1:6379');
    let wrapper: ResilientCacheWrapper;

    beforeEach(() => {
      wrapper = new ResilientCacheWrapper(makeFailingInner(err));
    });

    it('get returns null instead of throwing', async () => {
      await expect(wrapper.get('k')).resolves.toBeNull();
    });

    it('set swallows the error', async () => {
      await expect(wrapper.set('k', 'v', 60)).resolves.toBeUndefined();
    });

    it('del swallows the error', async () => {
      await expect(wrapper.del('k')).resolves.toBeUndefined();
    });

    it('delByPrefix swallows the error', async () => {
      await expect(wrapper.delByPrefix('prefix:')).resolves.toBeUndefined();
    });

    it('setNx returns false instead of throwing', async () => {
      await expect(wrapper.setNx('k', 'v', 60)).resolves.toBe(false);
    });

    it('ping returns false instead of throwing', async () => {
      await expect(wrapper.ping()).resolves.toBe(false);
    });

    it('zadd swallows the error', async () => {
      await expect(wrapper.zadd('k', 'm', 1)).resolves.toBeUndefined();
    });

    it('ztop returns an empty array instead of throwing', async () => {
      await expect(wrapper.ztop('k', 5)).resolves.toEqual([]);
    });

    it('destroy swallows the error', async () => {
      await expect(wrapper.destroy()).resolves.toBeUndefined();
    });
  });

  describe('when inner cache succeeds', () => {
    let inner: CacheService;
    let wrapper: ResilientCacheWrapper;

    beforeEach(() => {
      inner = makeSuccessfulInner();
      wrapper = new ResilientCacheWrapper(inner);
    });

    it('passes through get values', async () => {
      await expect(wrapper.get<string>('k')).resolves.toBe('value');
      expect(inner.get).toHaveBeenCalledWith('k');
    });

    it('passes through set with TTL', async () => {
      await wrapper.set('k', 'v', 60);
      expect(inner.set).toHaveBeenCalledWith('k', 'v', 60);
    });

    it('passes through setNx result', async () => {
      await expect(wrapper.setNx('k', 'v', 60)).resolves.toBe(true);
    });

    it('passes through ping result', async () => {
      await expect(wrapper.ping()).resolves.toBe(true);
    });

    it('passes through ztop result', async () => {
      await expect(wrapper.ztop('k', 5)).resolves.toEqual([{ member: 'a', score: 1 }]);
    });
  });

  it('handles inner cache without destroy() method', async () => {
    const inner = makeSuccessfulInner();
    delete (inner as { destroy?: unknown }).destroy;
    const wrapper = new ResilientCacheWrapper(inner);
    await expect(wrapper.destroy()).resolves.toBeUndefined();
  });

  it('handles non-Error thrown values', async () => {
    const inner: CacheService = {
      ...makeSuccessfulInner(),
      get: jest.fn().mockRejectedValue('string-error'),
    };
    const wrapper = new ResilientCacheWrapper(inner);
    await expect(wrapper.get('k')).resolves.toBeNull();
  });
});
