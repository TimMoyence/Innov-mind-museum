jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { logger } from '@shared/logger/logger';

import {
  buildOverpassCacheKey,
  fireOverpassBackgroundRefresh,
  shouldOverpassEarlyRefresh,
  type OverpassCacheEntry,
} from '@shared/http/overpass-cache';

import type { CacheService } from '@shared/cache/cache.port';

describe('overpass-cache', () => {
  describe('buildOverpassCacheKey', () => {
    it('builds a radius-mode key with rounded coordinates', () => {
      const key = buildOverpassCacheKey({ lat: 48.864567, lng: 2.349812, radiusMeters: 1500 });
      expect(key).toBe('overpass:nearby:48.865:2.350:1.5');
    });

    it('builds a bbox-mode key with 2-decimal corners', () => {
      const key = buildOverpassCacheKey({ bbox: [2.34, 48.85, 2.36, 48.87] });
      expect(key).toBe('overpass:bbox:2.34,48.85,2.36,48.87');
    });

    it('appends q-suffix when text filter is present', () => {
      const key = buildOverpassCacheKey({ lat: 48.86, lng: 2.34, radiusMeters: 1000, q: 'LOUVRE' });
      expect(key).toContain(':q=louvre');
    });

    it('returns null when no coordinates and no bbox provided', () => {
      expect(buildOverpassCacheKey({})).toBeNull();
    });

    // Partial-params kill: any single coord absent must return null, never crash.
    // Targets ConditionalExpression L50:7,29,51 + LogicalOperator L50:7 in overpass-cache.ts.
    it.each([
      ['radiusMeters only', { radiusMeters: 1000 }],
      ['lat only', { lat: 48 }],
      ['lng only', { lng: 2 }],
      ['lat + lng (no radius)', { lat: 48, lng: 2 }],
      ['lat + radius (no lng)', { lat: 48, radiusMeters: 1000 }],
      ['lng + radius (no lat)', { lng: 2, radiusMeters: 1000 }],
    ])('returns null for partial params: %s', (_label, params) => {
      expect(buildOverpassCacheKey(params)).toBeNull();
    });
  });

  describe('shouldOverpassEarlyRefresh', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('returns false before the 90% threshold', () => {
      const entry: OverpassCacheEntry = { value: [], storedAtMs: 1_000, ttlSeconds: 60 };
      const now = 1_000 + 30_000; // 50% elapsed
      expect(shouldOverpassEarlyRefresh(entry, now)).toBe(false);
    });

    it('returns false on a zero-ttl entry', () => {
      const entry: OverpassCacheEntry = { value: [], storedAtMs: 1_000, ttlSeconds: 0 };
      expect(shouldOverpassEarlyRefresh(entry, 100_000)).toBe(false);
    });

    it('returns a boolean past the threshold (probabilistic)', () => {
      const entry: OverpassCacheEntry = { value: [], storedAtMs: 1_000, ttlSeconds: 60 };
      const now = 1_000 + 60_000; // 100% elapsed → always true (Math.random < 1)
      expect(typeof shouldOverpassEarlyRefresh(entry, now)).toBe('boolean');
    });

    // Deterministic kills of L115:10/26/27/70 mutations (ConditionalExpression,
    // EqualityOperator, ArithmeticOperator on the probabilistic adjustment).
    // ratio=0.95 → adjustment=(0.95-0.9)/(1-0.9)=0.5. Math.random=0.04 < 0.5 → true.
    it('returns true when Math.random rolls below the elapsed-ratio adjustment', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.04);
      const entry: OverpassCacheEntry = { value: [], storedAtMs: 0, ttlSeconds: 100 };
      expect(shouldOverpassEarlyRefresh(entry, 95_000)).toBe(true);
    });

    // ratio=0.91 → adjustment=0.1. Math.random=0.99 < 0.1 → false.
    it('returns false when Math.random rolls above the elapsed-ratio adjustment', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.99);
      const entry: OverpassCacheEntry = { value: [], storedAtMs: 0, ttlSeconds: 100 };
      expect(shouldOverpassEarlyRefresh(entry, 91_000)).toBe(false);
    });

    // Hits ArithmeticOperator L115:26 (/ → *): mutation makes adjustment huge,
    // letting Math.random=0.04 < big_number stay true; original requires the
    // ratio gap. Distinguishes via a Math.random value exactly at the divisor.
    it('returns true only when adjustment denominator divides correctly', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.45);
      const entry: OverpassCacheEntry = { value: [], storedAtMs: 0, ttlSeconds: 100 };
      // ratio=0.95 → adjustment=0.5; 0.45 < 0.5 → true (original). With * mutator
      // adjustment becomes 0.005 → 0.45 < 0.005 → false. Different outcome.
      expect(shouldOverpassEarlyRefresh(entry, 95_000)).toBe(true);
    });

    // Kills L115:10 EqualityOperator (< → <=): at the exact adjustment boundary
    // Math.random=adjustment, the strict comparison is the only distinguishable
    // behaviour.
    it('returns false when Math.random equals the adjustment boundary exactly', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.5);
      const entry: OverpassCacheEntry = { value: [], storedAtMs: 0, ttlSeconds: 100 };
      // ratio=0.95 → adjustment=0.5; original 0.5 < 0.5 → false. With <= mutator
      // it would flip to true.
      expect(shouldOverpassEarlyRefresh(entry, 95_000)).toBe(false);
    });
  });

  describe('fireOverpassBackgroundRefresh', () => {
    it('writes a fresh entry to the cache', async () => {
      const set = jest.fn().mockResolvedValue(undefined);
      const cache = { set, get: jest.fn(), delete: jest.fn() } as unknown as CacheService;
      const refresh = jest.fn().mockResolvedValue([
        {
          name: 'Mock',
          address: null,
          latitude: 0,
          longitude: 0,
          osmId: 1,
          museumType: 'art' as const,
        },
      ]);
      fireOverpassBackgroundRefresh({
        cache,
        params: { lat: 48.86, lng: 2.34, radiusMeters: 1000 },
        cacheKey: 'overpass:test',
        positiveTtlSeconds: 86_400,
        negativeTtlSeconds: 3_600,
        refresh,
      });
      // Wait one microtask cycle for the void IIFE to flush
      await new Promise((resolve) => setImmediate(resolve));
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(set).toHaveBeenCalledWith(
        'overpass:test',
        expect.objectContaining({ ttlSeconds: 86_400 }),
        86_400,
      );
    });

    it('uses negative TTL when refresh returns empty', async () => {
      const set = jest.fn().mockResolvedValue(undefined);
      const cache = { set, get: jest.fn(), delete: jest.fn() } as unknown as CacheService;
      const refresh = jest.fn().mockResolvedValue([]);
      fireOverpassBackgroundRefresh({
        cache,
        params: { lat: 48.86, lng: 2.34, radiusMeters: 1000 },
        cacheKey: 'overpass:test:neg',
        positiveTtlSeconds: 86_400,
        negativeTtlSeconds: 3_600,
        refresh,
      });
      await new Promise((resolve) => setImmediate(resolve));
      expect(set).toHaveBeenCalledWith(
        'overpass:test:neg',
        expect.objectContaining({ ttlSeconds: 3_600 }),
        3_600,
      );
    });

    it('swallows refresh failures', async () => {
      const set = jest.fn();
      const cache = { set, get: jest.fn(), delete: jest.fn() } as unknown as CacheService;
      const refresh = jest.fn().mockRejectedValue(new Error('boom'));
      expect(() =>
        fireOverpassBackgroundRefresh({
          cache,
          params: { lat: 0, lng: 0, radiusMeters: 1000 },
          cacheKey: 'overpass:test:err',
          positiveTtlSeconds: 86_400,
          negativeTtlSeconds: 3_600,
          refresh,
        }),
      ).not.toThrow();
      await new Promise((resolve) => setImmediate(resolve));
      expect(set).not.toHaveBeenCalled();
    });

    // Kills L90:21 BlockStatement (empty catch), L91:19 StringLiteral, and
    // L91:57 ObjectLiteral mutations on fireOverpassBackgroundRefresh's error path.
    it('logs cacheKey + error message when refresh fails', async () => {
      (logger.warn as jest.Mock).mockClear();
      const set = jest.fn();
      const cache = { set, get: jest.fn(), delete: jest.fn() } as unknown as CacheService;
      const refresh = jest.fn().mockRejectedValue(new Error('boom'));
      fireOverpassBackgroundRefresh({
        cache,
        params: { lat: 0, lng: 0, radiusMeters: 1000 },
        cacheKey: 'overpass:test:err',
        positiveTtlSeconds: 86_400,
        negativeTtlSeconds: 3_600,
        refresh,
      });
      await new Promise((resolve) => setImmediate(resolve));
      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(
        'Overpass background refresh failed',
        expect.objectContaining({ cacheKey: 'overpass:test:err', error: 'boom' }),
      );
    });
  });
});
