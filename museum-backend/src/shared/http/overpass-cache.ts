import {
  createBackgroundRefresh,
  shouldEarlyRefresh,
  type RefreshableEntry,
} from '@shared/cache/probabilistic-refresh';
import { logger } from '@shared/logger/logger';

import type { OverpassMuseumResult, OverpassSearchParams } from './overpass-types';
import type { CacheService } from '@shared/cache/cache.port';

export type OverpassCacheEntry = RefreshableEntry<OverpassMuseumResult[]>;

const CACHE_KEY_COORD_PRECISION = 3;
const CACHE_KEY_BBOX_PRECISION = 2;
const CACHE_KEY_RADIUS_KM_PRECISION = 1;

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
    refresh: () => refresh(params),
    positiveTtlSeconds,
    negativeTtlSeconds,
  });
}

export const shouldOverpassEarlyRefresh = shouldEarlyRefresh<OverpassMuseumResult[]>;
