import { logger } from '@shared/logger/logger';

import type { OverpassMuseumResult, OverpassSearchParams } from './overpass-types';
import type { CacheService } from '@shared/cache/cache.port';

/**
 * `value: []` covers BOTH "live returned empty" and "live failed" — both trigger short
 * negative TTL to shield Overpass from quiet-region / transient-outage hammering.
 * Distinct from cache miss (entry exists in store). `storedAtMs` enables probabilistic
 * refresh on TTL-unaware cache port.
 */
export interface OverpassCacheEntry {
  value: OverpassMuseumResult[];
  storedAtMs: number;
  ttlSeconds: number;
}

const CACHE_KEY_COORD_PRECISION = 3;
const CACHE_KEY_BBOX_PRECISION = 2;
const CACHE_KEY_RADIUS_KM_PRECISION = 1;
const EARLY_REFRESH_THRESHOLD = 0.9;

/**
 * Radius-mode: lat/lng to 3dp (~111m) + radius to 0.1km — absorbs GPS jitter.
 * Bbox-mode: corners to 2dp. `q` filter is part of the key (no collision with unfiltered).
 */
export function buildOverpassCacheKey(params: OverpassSearchParams): string | null {
  const qSuffix = params.q ? `:q=${params.q.toLowerCase()}` : '';
  if (params.bbox) {
    const [minLng, minLat, maxLng, maxLat] = params.bbox;
    const corners = [
      minLng.toFixed(CACHE_KEY_BBOX_PRECISION),
      minLat.toFixed(CACHE_KEY_BBOX_PRECISION),
      maxLng.toFixed(CACHE_KEY_BBOX_PRECISION),
      maxLat.toFixed(CACHE_KEY_BBOX_PRECISION),
    ].join(',');
    return `overpass:bbox:${corners}${qSuffix}`;
  }
  if (params.lat != null && params.lng != null && params.radiusMeters != null) {
    const radiusKm = params.radiusMeters / 1_000;
    return [
      'overpass:nearby',
      params.lat.toFixed(CACHE_KEY_COORD_PRECISION),
      params.lng.toFixed(CACHE_KEY_COORD_PRECISION),
      radiusKm.toFixed(CACHE_KEY_RADIUS_KM_PRECISION),
    ]
      .join(':')
      .concat(qSuffix);
  }
  return null;
}

export interface OverpassBackgroundRefreshArgs {
  cache: CacheService;
  params: OverpassSearchParams;
  cacheKey: string;
  positiveTtlSeconds: number;
  negativeTtlSeconds: number;
  refresh: (params: OverpassSearchParams) => Promise<OverpassMuseumResult[]>;
}

/** Fire-and-forget. Never throws. */
export function fireOverpassBackgroundRefresh(args: OverpassBackgroundRefreshArgs): void {
  const { cache, params, cacheKey, positiveTtlSeconds, negativeTtlSeconds, refresh } = args;
  void (async () => {
    try {
      const fresh = await refresh(params);
      const entry: OverpassCacheEntry = {
        value: fresh,
        storedAtMs: Date.now(),
        ttlSeconds: fresh.length > 0 ? positiveTtlSeconds : negativeTtlSeconds,
      };
      await cache.set(cacheKey, entry, entry.ttlSeconds);
    } catch (error) {
      logger.warn('Overpass background refresh failed', {
        error: error instanceof Error ? error.message : String(error),
        cacheKey,
      });
    }
  })();
}

/** Smooths thundering-herd at TTL expiry. Probabilistic refresh in last 10% TTL. */
export function shouldOverpassEarlyRefresh(entry: OverpassCacheEntry, nowMs: number): boolean {
  const elapsedMs = nowMs - entry.storedAtMs;
  const ttlMs = entry.ttlSeconds * 1_000;
  if (ttlMs <= 0) return false;
  const elapsedRatio = elapsedMs / ttlMs;
  // Stryker disable next-line ConditionalExpression,EqualityOperator: removing the early-return or flipping < to <= is observationally equivalent — both paths yield false when adjustment is ≤ 0 (Math.random < non-positive always false).
  if (elapsedRatio < EARLY_REFRESH_THRESHOLD) return false;
  // eslint-disable-next-line sonarjs/pseudo-random -- non-security: TTL jitter
  return Math.random() < (elapsedRatio - EARLY_REFRESH_THRESHOLD) / (1 - EARLY_REFRESH_THRESHOLD);
}
