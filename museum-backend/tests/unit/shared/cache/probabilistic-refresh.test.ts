jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { randomSource } from '@shared/utils/random';
import {
  EARLY_REFRESH_THRESHOLD_DEFAULT,
  createBackgroundRefresh,
  shouldEarlyRefresh,
  type RefreshableEntry,
} from '@shared/cache/probabilistic-refresh';

import type { CacheService } from '@shared/cache/cache.port';

async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

function makeCacheStub(overrides: Partial<Record<keyof CacheService, jest.Mock>> = {}): {
  cache: CacheService;
  set: jest.Mock;
  get: jest.Mock;
} {
  const set = overrides.set ?? jest.fn().mockResolvedValue(undefined);
  const get = overrides.get ?? jest.fn().mockResolvedValue(null);
  const cache: CacheService = {
    get,
    set,
    del: jest.fn().mockResolvedValue(undefined),
    delByPrefix: jest.fn().mockResolvedValue(undefined),
    setNx: jest.fn().mockResolvedValue(true),
    incrBy: jest.fn().mockResolvedValue(null),
    ping: jest.fn().mockResolvedValue(true),
    zadd: jest.fn().mockResolvedValue(undefined),
    ztop: jest.fn().mockResolvedValue([]),
  };
  return { cache, set, get };
}

function makeLoggerStub(): {
  logger: { warn: jest.Mock; info: jest.Mock; error: jest.Mock };
  warn: jest.Mock;
} {
  const warn = jest.fn();
  return {
    logger: { warn, info: jest.fn(), error: jest.fn() },
    warn,
  };
}

describe('probabilistic-refresh — shouldEarlyRefresh', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('exports EARLY_REFRESH_THRESHOLD_DEFAULT = 0.9', () => {
    expect(EARLY_REFRESH_THRESHOLD_DEFAULT).toBe(0.9);
  });

  it('returns false when elapsedRatio < threshold and never calls Math.random', () => {
    const spy = jest.spyOn(randomSource, 'unit');
    const entry: RefreshableEntry<unknown> = { value: null, storedAtMs: 0, ttlSeconds: 100 };
    expect(shouldEarlyRefresh(entry, 50_000)).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('returns false when ttlSeconds is zero and never calls Math.random', () => {
    const spy = jest.spyOn(randomSource, 'unit');
    const entry: RefreshableEntry<unknown> = { value: null, storedAtMs: 1_000, ttlSeconds: 0 };
    expect(shouldEarlyRefresh(entry, 100_000)).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('returns false when ttlSeconds is negative and never calls Math.random', () => {
    const spy = jest.spyOn(randomSource, 'unit');
    const entry: RefreshableEntry<unknown> = { value: null, storedAtMs: 1_000, ttlSeconds: -1 };
    expect(shouldEarlyRefresh(entry, 100_000)).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('returns true when Math.random rolls below the adjusted ratio', () => {
    jest.spyOn(randomSource, 'unit').mockReturnValue(0.04);
    const entry: RefreshableEntry<unknown> = { value: null, storedAtMs: 0, ttlSeconds: 100 };
    expect(shouldEarlyRefresh(entry, 95_000)).toBe(true);
  });

  it('returns false when Math.random equals the adjustment boundary exactly', () => {
    jest.spyOn(randomSource, 'unit').mockReturnValue(0.5);
    const entry: RefreshableEntry<unknown> = { value: null, storedAtMs: 0, ttlSeconds: 100 };
    expect(shouldEarlyRefresh(entry, 95_000)).toBe(false);
  });

  it('accepts a custom threshold override and uses it in the ratio formula', () => {
    jest.spyOn(randomSource, 'unit').mockReturnValue(0.1);
    const entry: RefreshableEntry<unknown> = { value: null, storedAtMs: 0, ttlSeconds: 100 };
    expect(shouldEarlyRefresh(entry, 85_000, 0.8)).toBe(true);
  });

  it('rejects a roll above the adjusted ratio with a custom threshold', () => {
    jest.spyOn(randomSource, 'unit').mockReturnValue(0.3);
    const entry: RefreshableEntry<unknown> = { value: null, storedAtMs: 0, ttlSeconds: 100 };
    expect(shouldEarlyRefresh(entry, 85_000, 0.8)).toBe(false);
  });

  it('accepts a union-with-null payload type (T = X | null)', () => {
    jest.spyOn(randomSource, 'unit').mockReturnValue(0.99);
    const entry: RefreshableEntry<{ x: number } | null> = {
      value: null,
      storedAtMs: 0,
      ttlSeconds: 100,
    };
    expect(shouldEarlyRefresh(entry, 95_000)).toBe(false);
  });
});

describe('probabilistic-refresh — createBackgroundRefresh', () => {
  it('calls cache.set with positiveTtlSeconds when isEmpty(value) returns false', async () => {
    const { cache, set } = makeCacheStub();
    const { logger } = makeLoggerStub();
    const trigger = createBackgroundRefresh<number[]>({
      cache,
      logger,
      opName: 'test-op',
      failureMessage: 'test refresh failed',
      isEmpty: (v) => v.length === 0,
    });
    trigger({
      cacheKey: 'k:positive',
      refresh: () => Promise.resolve([1, 2, 3]),
      positiveTtlSeconds: 86_400,
      negativeTtlSeconds: 3_600,
    });
    await flushMicrotasks();
    expect(set).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith(
      'k:positive',
      expect.objectContaining({ value: [1, 2, 3], ttlSeconds: 86_400 }),
      86_400,
    );
  });

  it('calls cache.set with negativeTtlSeconds when isEmpty(value) returns true', async () => {
    const { cache, set } = makeCacheStub();
    const { logger } = makeLoggerStub();
    const trigger = createBackgroundRefresh<number[]>({
      cache,
      logger,
      opName: 'test-op',
      failureMessage: 'test refresh failed',
      isEmpty: (v) => v.length === 0,
    });
    trigger({
      cacheKey: 'k:negative',
      refresh: () => Promise.resolve([]),
      positiveTtlSeconds: 86_400,
      negativeTtlSeconds: 3_600,
    });
    await flushMicrotasks();
    expect(set).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith(
      'k:negative',
      expect.objectContaining({ value: [], ttlSeconds: 3_600 }),
      3_600,
    );
  });

  it('handles null-sentinel isEmpty (T = X | null) — picks negative TTL when value is null', async () => {
    const { cache, set } = makeCacheStub();
    const { logger } = makeLoggerStub();
    type Payload = { city: string } | null;
    const trigger = createBackgroundRefresh<Payload>({
      cache,
      logger,
      opName: 'nominatim-shaped',
      failureMessage: 'nominatim test',
      isEmpty: (v) => v == null,
    });
    trigger({
      cacheKey: 'k:null',
      refresh: () => Promise.resolve(null),
      positiveTtlSeconds: 86_400,
      negativeTtlSeconds: 600,
    });
    await flushMicrotasks();
    expect(set).toHaveBeenCalledWith(
      'k:null',
      expect.objectContaining({ value: null, ttlSeconds: 600 }),
      600,
    );
  });

  it('logs a warning when refresh rejects and never throws synchronously', async () => {
    const { cache, set } = makeCacheStub();
    const { logger, warn } = makeLoggerStub();
    const trigger = createBackgroundRefresh<number[]>({
      cache,
      logger,
      opName: 'test-op',
      failureMessage: 'Overpass background refresh failed',
      isEmpty: (v) => v.length === 0,
    });
    expect(() =>
      trigger({
        cacheKey: 'k:refresh-err',
        refresh: () => Promise.reject(new Error('boom')),
        positiveTtlSeconds: 86_400,
        negativeTtlSeconds: 3_600,
      }),
    ).not.toThrow();
    await flushMicrotasks();
    expect(set).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      'Overpass background refresh failed',
      expect.objectContaining({
        error: 'boom',
        cacheKey: 'k:refresh-err',
        op: 'test-op',
      }),
    );
  });

  it('logs a warning when cache.set rejects and never throws synchronously', async () => {
    const setReject = jest.fn().mockRejectedValue(new Error('redis down'));
    const { cache } = makeCacheStub({ set: setReject });
    const { logger, warn } = makeLoggerStub();
    const trigger = createBackgroundRefresh<number[]>({
      cache,
      logger,
      opName: 'nominatim',
      failureMessage: 'Nominatim background refresh failed',
      isEmpty: (v) => v.length === 0,
    });
    expect(() =>
      trigger({
        cacheKey: 'k:set-err',
        refresh: () => Promise.resolve([1]),
        positiveTtlSeconds: 86_400,
        negativeTtlSeconds: 3_600,
      }),
    ).not.toThrow();
    await flushMicrotasks();
    expect(setReject).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      'Nominatim background refresh failed',
      expect.objectContaining({
        error: 'redis down',
        cacheKey: 'k:set-err',
        op: 'nominatim',
      }),
    );
  });

  it('stringifies non-Error rejection values via String(error)', async () => {
    const { cache, set } = makeCacheStub();
    const { logger, warn } = makeLoggerStub();
    const trigger = createBackgroundRefresh<number[]>({
      cache,
      logger,
      opName: 'test-op',
      failureMessage: 'test refresh failed',
      isEmpty: (v) => v.length === 0,
    });
    trigger({
      cacheKey: 'k:string-err',
      refresh: () => Promise.reject('plain string'),
      positiveTtlSeconds: 86_400,
      negativeTtlSeconds: 3_600,
    });
    await flushMicrotasks();
    expect(set).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      'test refresh failed',
      expect.objectContaining({ error: 'plain string', cacheKey: 'k:string-err', op: 'test-op' }),
    );
  });

  it('returns a function with synchronous void return type', () => {
    const { cache } = makeCacheStub();
    const { logger } = makeLoggerStub();
    const trigger = createBackgroundRefresh<number[]>({
      cache,
      logger,
      opName: 'test-op',
      failureMessage: 'test refresh failed',
      isEmpty: (v) => v.length === 0,
    });
    expect(typeof trigger).toBe('function');
    const ret = trigger({
      cacheKey: 'k:return-shape',
      refresh: () => Promise.resolve([1]),
      positiveTtlSeconds: 100,
      negativeTtlSeconds: 10,
    });
    expect(ret).toBeUndefined();
  });

  it('includes the opName in the log context on failure', async () => {
    const { cache } = makeCacheStub();
    const { logger, warn } = makeLoggerStub();
    const trigger = createBackgroundRefresh<number[]>({
      cache,
      logger,
      opName: 'overpass',
      failureMessage: 'Overpass background refresh failed',
      isEmpty: (v) => v.length === 0,
    });
    trigger({
      cacheKey: 'k:op-context',
      refresh: () => Promise.reject(new Error('upstream-503')),
      positiveTtlSeconds: 86_400,
      negativeTtlSeconds: 3_600,
    });
    await flushMicrotasks();
    expect(warn).toHaveBeenCalledWith(
      'Overpass background refresh failed',
      expect.objectContaining({ op: 'overpass' }),
    );
  });
});
