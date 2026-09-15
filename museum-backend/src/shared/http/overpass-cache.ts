import {
  createBackgroundRefresh,
  shouldEarlyRefresh,
  type RefreshableEntry,
} from '@shared/cache/probabilistic-refresh';
import { logger } from '@shared/logger/logger';

import type {
  OverpassMuseumResult,
  OverpassQueryResult,
  OverpassSearchParams,
} from './overpass-types';
import type { CacheService } from '@shared/cache/cache.port';

/**
 * `value: []` represents a successful live query with no matches and triggers
 * the short negative TTL to shield Overpass from quiet-region hammering.
 * Infrastructure failures are deliberately not written to this cache.
 * Distinct from cache miss (entry exists in store). `storedAtMs` enables
 * probabilistic refresh on TTL-unaware cache port.
 *
 * Compat alias — kept so the rest of the codebase (and the existing tests in
 * `tests/unit/shared/overpass-cache.test.ts`) can keep importing
 * `OverpassCacheEntry` without coupling to the shared helper's generic.
 */
export type OverpassCacheEntry = RefreshableEntry<OverpassMuseumResult[]>;

const CACHE_KEY_COORD_PRECISION = 3;
const CACHE_KEY_BBOX_PRECISION = 2;
const CACHE_KEY_RADIUS_KM_PRECISION = 1;

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
  refresh: (params: OverpassSearchParams) => Promise<OverpassMuseumResult[] | OverpassQueryResult>;
}

/**
 * Fire-and-forget. Never throws. Delegates the actual orchestration (refresh
 * → empty-bucket TTL selection → cache.set → fail-soft logging) to the shared
 * `createBackgroundRefresh` factory — local code only carries the
 * Overpass-shaped `params` capture.
 */
export function fireOverpassBackgroundRefresh(args: OverpassBackgroundRefreshArgs): void {
  const { cache, params, cacheKey, positiveTtlSeconds, negativeTtlSeconds, refresh } = args;
  const trigger = createBackgroundRefresh<OverpassMuseumResult[]>({
    cache,
    logger,
    opName: 'overpass.background-refresh',
    failureMessage: 'Overpass background refresh failed',
    isEmpty: (value) => value.length === 0,
  });
  trigger({
    cacheKey,
    refresh: async () => {
      const result = await refresh(params);
      if (Array.isArray(result)) return result;
      if (result.allEndpointsFailed) {
        // Throwing here intentionally skips cache.set in the shared helper.
        // A transient Overpass outage must not become a cached empty result.
        throw new Error('all Overpass endpoints failed');
      }
      return result.museums;
    },
    positiveTtlSeconds,
    negativeTtlSeconds,
  });
}

/**
 * Smooths thundering-herd at TTL expiry. Probabilistic refresh in last 10% TTL.
 * Const-alias of the shared helper so callers can keep the Overpass-domain name
 * at the call site.
 */
export const shouldOverpassEarlyRefresh = shouldEarlyRefresh<OverpassMuseumResult[]>;
