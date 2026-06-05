/**
 * UFR-022 red phase — PR-10 probabilistic-refresh shared helper.
 * RUN_ID: 2026-05-23-pr-10-probabilistic-refresh.
 *
 * Direct unit tests for `@shared/cache/probabilistic-refresh` covering R5
 * cases (a)-(h) from the spec. The helper currently does NOT exist — these
 * tests are authored RED and FAIL with `Cannot find module …` until phase 4
 * green creates the module. Exit ≠ 0 = red success per UFR-022.
 *
 * Frozen-test discipline (UFR-022): this file is sha256-hashed in
 * red-test-manifest.json. Green phase MUST NOT modify it. Suspected bug →
 * emit `BLOCK-TEST-WRONG <file>:<line> <reason>`, do NOT touch.
 *
 * Spec sources of truth:
 *   .claude/skills/team/team-state/2026-05-23-pr-10-probabilistic-refresh/spec.md §4 (R1, R5)
 *                                                                            §6 A4 (acceptance)
 *   .claude/skills/team/team-state/2026-05-23-pr-10-probabilistic-refresh/design.md §1.2 (signatures)
 *                                                                              §4 (observable diff)
 *
 * Pattern reference: jest.spyOn(Math, 'random') + afterEach restoreAllMocks
 * mirrors museum-backend/tests/unit/shared/overpass-cache.test.ts:52-54,77,84.
 */
jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import {
  EARLY_REFRESH_THRESHOLD_DEFAULT,
  createBackgroundRefresh,
  shouldEarlyRefresh,
  type RefreshableEntry,
} from '@shared/cache/probabilistic-refresh';

import type { CacheService } from '@shared/cache/cache.port';

/** Flushes the IIFE microtask queue used by `createBackgroundRefresh` triggers. */
async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

/**
 * Minimal CacheService double — only the methods the helper touches are wired.
 * The other CacheService methods are stubbed to `jest.fn()` so accidental
 * touches surface as expectation failures rather than `undefined is not a fn`.
 * @param overrides
 */
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
    // R1: default threshold is 0.9 (spec §4 R1, design §1.2).
    expect(EARLY_REFRESH_THRESHOLD_DEFAULT).toBe(0.9);
  });

  // R5 (a) — elapsedRatio < threshold → false AND Math.random NOT called.
  it('returns false when elapsedRatio < threshold and never calls Math.random', () => {
    const spy = jest.spyOn(Math, 'random');
    const entry: RefreshableEntry<unknown> = { value: null, storedAtMs: 0, ttlSeconds: 100 };
    // 50_000 ms / 100_000 ms = 0.5 → < 0.9 → short-circuit return false.
    expect(shouldEarlyRefresh(entry, 50_000)).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  // R5 (b) — ttlSeconds === 0 → false AND Math.random NOT called.
  it('returns false when ttlSeconds is zero and never calls Math.random', () => {
    const spy = jest.spyOn(Math, 'random');
    const entry: RefreshableEntry<unknown> = { value: null, storedAtMs: 1_000, ttlSeconds: 0 };
    expect(shouldEarlyRefresh(entry, 100_000)).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  // R5 (b') — ttlSeconds < 0 (clock-skew defense) → false AND Math.random NOT called.
  it('returns false when ttlSeconds is negative and never calls Math.random', () => {
    const spy = jest.spyOn(Math, 'random');
    const entry: RefreshableEntry<unknown> = { value: null, storedAtMs: 1_000, ttlSeconds: -1 };
    expect(shouldEarlyRefresh(entry, 100_000)).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  // R5 (c) — Math.random < adjustedRatio → true.
  // ratio = 95_000 / 100_000 = 0.95 → adjustment = (0.95 - 0.9) / (1 - 0.9) = 0.5.
  // stub random=0.04 < 0.5 → true.
  it('returns true when Math.random rolls below the adjusted ratio', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.04);
    const entry: RefreshableEntry<unknown> = { value: null, storedAtMs: 0, ttlSeconds: 100 };
    expect(shouldEarlyRefresh(entry, 95_000)).toBe(true);
  });

  // R5 (c') — strict-less-than boundary: Math.random === adjustedRatio → false.
  // Kills EqualityOperator (< → <=) mutator.
  it('returns false when Math.random equals the adjustment boundary exactly', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const entry: RefreshableEntry<unknown> = { value: null, storedAtMs: 0, ttlSeconds: 100 };
    // ratio = 0.95, adjustment = 0.5, 0.5 < 0.5 = false (strict).
    expect(shouldEarlyRefresh(entry, 95_000)).toBe(false);
  });

  // R5 (c'') — threshold override parameter honoured.
  it('accepts a custom threshold override and uses it in the ratio formula', () => {
    // threshold = 0.8 → adjustment = (0.85 - 0.8) / (1 - 0.8) = 0.25.
    jest.spyOn(Math, 'random').mockReturnValue(0.1);
    const entry: RefreshableEntry<unknown> = { value: null, storedAtMs: 0, ttlSeconds: 100 };
    expect(shouldEarlyRefresh(entry, 85_000, 0.8)).toBe(true);
  });

  it('rejects a roll above the adjusted ratio with a custom threshold', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.3);
    const entry: RefreshableEntry<unknown> = { value: null, storedAtMs: 0, ttlSeconds: 100 };
    // threshold = 0.8, ratio = 0.85, adjustment = 0.25, 0.3 < 0.25 = false.
    expect(shouldEarlyRefresh(entry, 85_000, 0.8)).toBe(false);
  });

  // R5 (c''') — Generic accepts union-with-null (NominatimReverseResult | null shape).
  // NFR-1 from spec §5: T = X | null resolves without runtime guard.
  it('accepts a union-with-null payload type (T = X | null)', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.99);
    const entry: RefreshableEntry<{ x: number } | null> = {
      value: null,
      storedAtMs: 0,
      ttlSeconds: 100,
    };
    // ratio = 0.95, adjustment = 0.5, 0.99 < 0.5 = false.
    expect(shouldEarlyRefresh(entry, 95_000)).toBe(false);
  });
});

describe('probabilistic-refresh — createBackgroundRefresh', () => {
  // R5 (d) — positive TTL when isEmpty=false.
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

  // R5 (e) — negative TTL when isEmpty=true.
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

  // R5 (e') — null-sentinel isEmpty form (Nominatim-shaped payload).
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

  // R5 (f) — refresh throws → logger.warn called, trigger does NOT throw.
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

  // R5 (g) — cache.set throws → logger.warn called, trigger does NOT throw.
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

  // R5 (h) — non-Error thrown values are stringified (String(error) branch).
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
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- intentional non-Error reject to exercise String(error) branch
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

  // Factory returns a fresh function — deduplication of repeated factory calls is
  // NOT a feature of the helper (callers cache the trigger themselves). This test
  // pins that the trigger is a callable synchronous void.
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

  // Logger contract: the helper passes `op: opName` so dashboards can split
  // sources without parsing `failureMessage`. This is the ADDITIVE change from
  // design.md §4 — frozen tests at the sweep sites assert
  // `expect.objectContaining({error, cacheKey})` which remains satisfied.
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
