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

/**
 * Queries the Overpass API for the `opening_hours` tag of a museum at the
 * given point. Tries the same endpoint chain as {@link queryOverpassMuseums}
 * and returns the first non-null tag value.
 *
 * @param params - Location of the museum.
 * @param params.lat - Latitude of the query point (WGS84).
 * @param params.lng - Longitude of the query point (WGS84).
 * @param params.radiusMeters - Search radius around the point, defaults to 50 m.
 * @param timeoutMs - Per-endpoint timeout in milliseconds.
 * @returns Raw OSM `opening_hours` value, or null if unavailable.
 */
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
 * Queries the Overpass API for museums near a given location (or inside a bbox).
 * Tries endpoints in order (main → Kumi mirror) and returns the first success.
 * Returns an empty array on full failure (all endpoints failed).
 *
 * WARNING: this is the RAW live adapter — it hits OSM Overpass on every call.
 * Production call sites MUST go through {@link createCachedOverpassClient} so
 * the result is memoised in Redis with sane positive / negative TTLs (OSM
 * Overpass runs on volunteer infrastructure, hammering it risks throttling or
 * a block). The raw export is retained for tests and one-off calls only.
 *
 * @param params - Search parameters (coordinates + radius OR bbox, optional text filter).
 * @param timeoutMs - HTTP request timeout per endpoint in milliseconds (default 30000).
 * @returns Array of parsed museum results.
 */
export async function queryOverpassMuseums(
  params: OverpassSearchParams,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<OverpassMuseumResult[]> {
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
 * Builds an Overpass museum-search function that is cached against the given
 * {@link CacheService}, shielding OSM Overpass from repeat hot-path queries.
 *
 * Behaviour:
 *   - Cache key: `overpass:nearby:<lat.3>:<lng.3>:<radiusKm.1>` (radius mode)
 *     or `overpass:bbox:<minLng.2>,<minLat.2>,<maxLng.2>,<maxLat.2>` (bbox mode).
 *     Rounded so GPS jitter / minor radius tweaks don't fragment the cache.
 *   - Positive TTL: `env.overpass.cacheTtlSeconds` (default 24h).
 *   - Negative TTL: `env.overpass.negativeCacheTtlSeconds` (default 1h). Empty
 *     arrays ([]) are stored with the negative TTL so quiet regions / transient
 *     failures don't pin a long empty cache.
 *   - Sentinel-wrapped entries `{ value, storedAtMs, ttlSeconds }` let us
 *     distinguish cache miss vs. cached-empty vs. cached-positive.
 *   - Probabilistic early expiration: in the last 10% of TTL, a weighted coin
 *     flip fires a background refresh (fail-silent).
 *   - Fail-open: any cache read/write error is logged as a warning and the
 *     live call proceeds — availability > cache coherence for this adapter.
 *   - No rate limiter: unlike Nominatim's 1 req/s OSMF policy, Overpass is
 *     elastic and the `OVERPASS_ENDPOINTS` fallback chain already handles
 *     throttling by admission budget.
 *
 * @param cache - CacheService implementation (Redis in prod, memory in tests).
 * @returns A function `(params) => Promise<OverpassMuseumResult[]>`.
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
