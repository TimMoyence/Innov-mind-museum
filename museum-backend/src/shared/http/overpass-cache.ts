import { logger } from '@shared/logger/logger';

import type { OverpassMuseumResult, OverpassSearchParams } from './overpass-types';
import type { CacheService } from '@shared/cache/cache.port';

/**
 * Cache envelope wrapping a value + the epoch (ms) at which it was stored.
 * We store the timestamp alongside the value so we can implement probabilistic
 * early expiration in a TTL-unaware cache port (Redis tells us it exists, not
 * how much of its TTL has elapsed).
 *
 * `value: []` is used for BOTH "live call returned empty" and "live call failed"
 * — both trigger the short negative TTL so we don't hammer Overpass on quiet
 * regions or transient outages. Distinct from a cache miss because the entry
 * exists in the cache store.
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
 * Builds a deterministic cache key for an Overpass search.
 *
 * Radius-mode keys round lat/lng to 3 decimals (~111m) and radius to 0.1 km so
 * GPS jitter and off-by-a-few-meters radii don't produce new keys on every
 * chat message. Bbox-mode keys round the four corners to 2 decimals.
 *
 * Text filter (`q`) is part of the key so name-filtered results don't collide
 * with the unfiltered variant.
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

/** Arguments for the background refresh helper. Bagged to stay under max-params: 5. */
export interface OverpassBackgroundRefreshArgs {
  cache: CacheService;
  params: OverpassSearchParams;
  cacheKey: string;
  positiveTtlSeconds: number;
  negativeTtlSeconds: number;
  refresh: (params: OverpassSearchParams) => Promise<OverpassMuseumResult[]>;
}

/**
 * Fires a background refresh of a soon-to-expire entry. Never throws — any
 * failure is swallowed and logged as a warning. Intended for use by the
 * probabilistic early-expiration path only.
 */
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

/**
 * Returns true when the cached entry has consumed at least
 * {@link EARLY_REFRESH_THRESHOLD} of its TTL and a probabilistic roll
 * elects to kick off a background refresh.
 *
 * Smooths out the thundering-herd at TTL expiry: callers late in the window
 * serve the cached value *and* opportunistically refresh it in the background,
 * so the next cold miss is rare.
 */
export function shouldOverpassEarlyRefresh(entry: OverpassCacheEntry, nowMs: number): boolean {
  const elapsedMs = nowMs - entry.storedAtMs;
  const ttlMs = entry.ttlSeconds * 1_000;
  if (ttlMs <= 0) return false;
  const elapsedRatio = elapsedMs / ttlMs;
  if (elapsedRatio < EARLY_REFRESH_THRESHOLD) return false;
  // eslint-disable-next-line sonarjs/pseudo-random -- non-security: TTL jitter
  return Math.random() < (elapsedRatio - EARLY_REFRESH_THRESHOLD) / (1 - EARLY_REFRESH_THRESHOLD);
}
