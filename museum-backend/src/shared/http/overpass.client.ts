import { OUTAGE_CACHE_TTL_SECONDS } from '@shared/cache/probabilistic-refresh';
import { errorMessage } from '@shared/errors/error-message';
import { logger } from '@shared/logger/logger';
import { env } from '@src/config/env';

import {
  buildOverpassCacheKey,
  fireOverpassBackgroundRefresh,
  shouldOverpassEarlyRefresh,
  type OverpassCacheEntry,
} from './overpass-cache';
import { DEFAULT_TIMEOUT_MS, OVERPASS_ENDPOINTS, SEARCH_BUDGET_MS } from './overpass-constants';
import { buildBboxQuery, buildOpeningHoursQuery, buildRadiusQuery } from './overpass-queries';
import { fetchFromEndpoint, postQuery } from './overpass-transport';

import type {
  CachedOverpassSearchFn,
  OverpassMuseumResult,
  OverpassResponse,
  OverpassSearchParams,
} from './overpass-types';
import type { CacheService } from '@shared/cache/cache.port';

export {
  MUSEUM_CATEGORIES,
  type CachedOverpassSearchFn,
  type MuseumCategory,
  type OverpassBoundingBox,
  type OverpassMuseumResult,
  type OverpassSearchParams,
} from './overpass-types';

export async function queryOverpassOpeningHours(
  params: { lat: number; lng: number; radiusMeters?: number },
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<string | null> {
  const radius = params.radiusMeters ?? 50;
  const query = buildOpeningHoursQuery(params.lat, params.lng, radius);

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await postQuery(endpoint, query, timeoutMs);
      if (!response.ok) continue;
      const data = (await response.json()) as OverpassResponse;
      if (!Array.isArray(data.elements)) continue;
      for (const el of data.elements) {
        const value = el.tags?.opening_hours;
        if (value?.trim()) return value;
      }
      return null;
    } catch (error) {
      logger.warn('Overpass opening_hours query failed — trying next', {
        endpoint,
        error: errorMessage(error),
        lat: params.lat,
        lng: params.lng,
      });
    }
  }

  logger.warn('All Overpass endpoints failed for opening_hours', {
    lat: params.lat,
    lng: params.lng,
  });
  return null;
}

export async function queryOverpassMuseums(
  params: OverpassSearchParams,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  budgetMs: number = SEARCH_BUDGET_MS,
): Promise<OverpassMuseumResult[]> {
  return await fetchOverpassMuseums(params, timeoutMs, budgetMs).catch(() => []);
}

async function fetchOverpassMuseums(
  params: OverpassSearchParams,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  budgetMs: number = SEARCH_BUDGET_MS,
): Promise<OverpassMuseumResult[]> {
  const deadline = Date.now() + budgetMs;
  const { lat, lng, radiusMeters, bbox, q } = params;
  let query: string;
  if (bbox) {
    query = buildBboxQuery(bbox);
  } else if (lat != null && lng != null && radiusMeters != null) {
    query = buildRadiusQuery(lat, lng, radiusMeters);
  } else {
    logger.warn('queryOverpassMuseums called without bbox or center+radius — skipping');
    return [];
  }

  for (const endpoint of OVERPASS_ENDPOINTS) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) break;
    try {
      const results = await fetchFromEndpoint(endpoint, query, Math.min(timeoutMs, remainingMs), q);
      if (results !== null) return results;
    } catch (error) {
      logger.warn('Overpass endpoint query failed — trying next', {
        endpoint,
        error: errorMessage(error),
        lat,
        lng,
        radiusMeters,
        bbox,
      });
    }
  }

  logger.warn('All Overpass endpoints failed', { lat, lng, radiusMeters, bbox });
  throw new Error('All Overpass endpoints failed');
}

export function createCachedOverpassClient(cache: CacheService): CachedOverpassSearchFn {
  const positiveTtlSeconds = env.overpass.cacheTtlSeconds;
  const negativeTtlSeconds = env.overpass.negativeCacheTtlSeconds;

  return async function cachedOverpassSearch(
    params: OverpassSearchParams,
  ): Promise<OverpassMuseumResult[]> {
    const cacheKey = buildOverpassCacheKey(params);
    if (!cacheKey) {
      return await queryOverpassMuseums(params);
    }

    let cached: OverpassCacheEntry | null = null;
    try {
      cached = await cache.get<OverpassCacheEntry>(cacheKey);
    } catch (error) {
      logger.warn('Overpass cache read failed, falling back to live', {
        error: errorMessage(error),
        cacheKey,
      });
    }

    if (cached) {
      if (shouldOverpassEarlyRefresh(cached, Date.now())) {
        fireOverpassBackgroundRefresh({
          cache,
          params,
          cacheKey,
          positiveTtlSeconds,
          negativeTtlSeconds,
          refresh: fetchOverpassMuseums,
        });
      }
      return cached.value;
    }

    let live: OverpassMuseumResult[];
    let ttlSeconds: number;
    try {
      live = await fetchOverpassMuseums(params);
      ttlSeconds = live.length > 0 ? positiveTtlSeconds : negativeTtlSeconds;
    } catch {
      live = [];
      ttlSeconds = OUTAGE_CACHE_TTL_SECONDS;
    }
    const entry: OverpassCacheEntry = { value: live, storedAtMs: Date.now(), ttlSeconds };

    try {
      await cache.set(cacheKey, entry, entry.ttlSeconds);
    } catch (error) {
      logger.warn('Overpass cache write failed, serving live result', {
        error: errorMessage(error),
        cacheKey,
      });
    }

    return live;
  };
}
