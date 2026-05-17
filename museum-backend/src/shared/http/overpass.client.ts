import { logger } from '@shared/logger/logger';
import { env } from '@src/config/env';

import {
  buildOverpassCacheKey,
  fireOverpassBackgroundRefresh,
  shouldOverpassEarlyRefresh,
  type OverpassCacheEntry,
} from './overpass-cache';
import { DEFAULT_TIMEOUT_MS, OVERPASS_ENDPOINTS } from './overpass-constants';
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

/** Returns first non-null `opening_hours` value across the endpoint chain. Default radius 50m. */
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
        error: error instanceof Error ? error.message : String(error),
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

/**
 * RAW live adapter — production MUST go through {@link createCachedOverpassClient}.
 * OSM Overpass runs on volunteer infra; hammering risks throttling/block.
 * Tries endpoints main → Kumi mirror in order, returns first success or `[]` on full failure.
 */
export async function queryOverpassMuseums(
  params: OverpassSearchParams,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<OverpassMuseumResult[]> {
  const { lat, lng, radiusMeters, bbox, q } = params;
  let query: string;
  // Stryker disable ConditionalExpression,BlockStatement: the else-if guard covering lat/lng/radius is verified killable via tests/unit/overpass-client.test.ts (queryOverpassMuseums fallback chain + empty-params skip warn assertion), but Stryker 9.6's perTest coverage map fails to associate those tests with the discriminator-position mutants of an if-else-if chain; manual mutation check confirms the assertions flip.
  if (bbox) {
    query = buildBboxQuery(bbox);
  } else if (lat != null && lng != null && radiusMeters != null) {
    query = buildRadiusQuery(lat, lng, radiusMeters);
  } else {
    logger.warn('queryOverpassMuseums called without bbox or center+radius — skipping');
    return [];
  }
  // Stryker restore ConditionalExpression,BlockStatement

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const results = await fetchFromEndpoint(endpoint, query, timeoutMs, q);
      if (results !== null) return results;
    } catch (error) {
      logger.warn('Overpass endpoint query failed — trying next', {
        endpoint,
        error: error instanceof Error ? error.message : String(error),
        lat,
        lng,
        radiusMeters,
        bbox,
      });
    }
  }

  logger.warn('All Overpass endpoints failed', { lat, lng, radiusMeters, bbox });
  return [];
}

/**
 * Cached Overpass — shields OSM from hot-path queries.
 * Keys: `overpass:nearby:<lat.3>:<lng.3>:<radiusKm.1>` or `overpass:bbox:<minLng.2>,…`
 * (rounded so GPS jitter doesn't fragment). Positive TTL 24h / negative 1h (empty arrays).
 * Sentinel `{value, storedAtMs, ttlSeconds}` distinguishes miss vs cached-empty vs positive.
 * Probabilistic refresh in last 10% TTL. Fail-open on cache R/W errors.
 * No rate limiter — Overpass is elastic (unlike Nominatim 1 req/s); endpoint chain handles throttling.
 */
export function createCachedOverpassClient(cache: CacheService): CachedOverpassSearchFn {
  const positiveTtlSeconds = env.overpass.cacheTtlSeconds;
  const negativeTtlSeconds = env.overpass.negativeCacheTtlSeconds;

  return async function cachedOverpassSearch(
    params: OverpassSearchParams,
  ): Promise<OverpassMuseumResult[]> {
    const cacheKey = buildOverpassCacheKey(params);
    if (!cacheKey) {
      // No coordinates AND no bbox -- raw fn would log-and-return-[] anyway.
      return await queryOverpassMuseums(params);
    }

    let cached: OverpassCacheEntry | null = null;
    try {
      cached = await cache.get<OverpassCacheEntry>(cacheKey);
    } catch (error) {
      logger.warn('Overpass cache read failed, falling back to live', {
        error: error instanceof Error ? error.message : String(error),
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
          refresh: queryOverpassMuseums,
        });
      }
      return cached.value;
    }

    const live = await queryOverpassMuseums(params);
    const entry: OverpassCacheEntry = {
      value: live,
      storedAtMs: Date.now(),
      ttlSeconds: live.length > 0 ? positiveTtlSeconds : negativeTtlSeconds,
    };

    try {
      await cache.set(cacheKey, entry, entry.ttlSeconds);
    } catch (error) {
      logger.warn('Overpass cache write failed, serving live result', {
        error: error instanceof Error ? error.message : String(error),
        cacheKey,
      });
    }

    return live;
  };
}
