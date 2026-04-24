import { logger } from '@shared/logger/logger';
import { env } from '@src/config/env';

import type { CacheService } from '@shared/cache/cache.port';

/** Normalized museum category derived from OSM tags or stored in the DB. */
export const MUSEUM_CATEGORIES = ['art', 'history', 'science', 'specialized', 'general'] as const;
/**
 *
 */
export type MuseumCategory = (typeof MUSEUM_CATEGORIES)[number];

/** Raw museum result parsed from the Overpass API response. */
export interface OverpassMuseumResult {
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  osmId: number;
  museumType: MuseumCategory;
}

/** A WGS84 bounding box ordered as [minLng, minLat, maxLng, maxLat]. */
export type OverpassBoundingBox = [number, number, number, number];

/**
 * Parameters for querying museums via Overpass. Either a center+radius
 * (`lat`/`lng`/`radiusMeters`) or a `bbox` must be provided. When `bbox`
 * is set, it takes precedence and the center+radius is ignored.
 */
export interface OverpassSearchParams {
  lat?: number;
  lng?: number;
  radiusMeters?: number;
  bbox?: OverpassBoundingBox;
  /** Optional text filter applied to museum names after fetch. */
  q?: string;
}

/** Signature of a cached Overpass museum-search function. */
export type CachedOverpassSearchFn = (
  params: OverpassSearchParams,
) => Promise<OverpassMuseumResult[]>;

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements: OverpassElement[];
}

/**
 * Ordered list of Overpass API endpoints tried in sequence on failure.
 * Main instance first (fastest when it admits the query), community
 * mirrors as fallback chain.
 *
 * - overpass-api.de: main DE instance, fastest but throttles cloud IPs
 * - kumi.systems: community-funded mirror, strong hardware
 * - private.coffee: Austrian non-profit, explicitly no rate limit
 *
 * Source: https://wiki.openstreetmap.org/wiki/Overpass_API#Public_Overpass_API_instances
 */
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
/**
 * Client-side fetch timeout per endpoint. Kept low so worst-case chain
 * (3 endpoints × 6s) stays under the VPS nginx gateway timeout (≈ 20s).
 * Real queries with [timeout:180] take < 3s in practice.
 */
const DEFAULT_TIMEOUT_MS = 6_000;
/**
 * Overpass QL `[timeout:N]` directive — acts as a RESOURCE ADMISSION BUDGET,
 * not a real timeout. The server refuses to run the query if N seems
 * insufficient for its internal resource estimate.
 *
 * Empirically (2026-04-10): `timeout:25` was rejected with 504 in ~5s
 * ("query admission denied") on dense zones. `timeout:180` (the Overpass
 * default) is admitted and the query completes in <2s. Counter-intuitive
 * but documented in Overpass commons:
 * https://dev.overpass-api.de/overpass-doc/en/preface/commons.html
 */
const QL_TIMEOUT_SECONDS = 180;
/**
 * Identifying User-Agent per OSM Operations convention
 * (https://operations.osmfoundation.org/policies/api/).
 * A real contact is required so OSM admins can reach us if we misbehave.
 */
const USER_AGENT = 'Musaium/1.0 (+https://musaium.com; contact@musaium.com)';

/**
 * Builds an Overpass QL query for museums within a radius of a given point.
 *
 * Uses the `nwr` shortcut purely for readability (same execution plan as
 * `(node; way; relation;)` — Overpass-API issue #504). The real fix for
 * the 504s is the `[timeout:180]` admission budget — see QL_TIMEOUT_SECONDS
 * for the full explanation.
 */
const buildRadiusQuery = (lat: number, lng: number, radiusMeters: number): string => {
  const r = String(radiusMeters);
  const coords = `${String(lat)},${String(lng)}`;
  return [
    `[out:json][timeout:${String(QL_TIMEOUT_SECONDS)}];`,
    `nwr["tourism"="museum"](around:${r},${coords});`,
    'out center;',
  ].join('\n');
};

/**
 * Builds an Overpass QL query for museums inside a bounding box.
 * Overpass uses (south,west,north,east) ordering — opposite to GeoJSON.
 */
const buildBboxQuery = (bbox: OverpassBoundingBox): string => {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const filter = `${String(minLat)},${String(minLng)},${String(maxLat)},${String(maxLng)}`;
  return [
    `[out:json][timeout:${String(QL_TIMEOUT_SECONDS)}];`,
    `nwr["tourism"="museum"](${filter});`,
    'out center;',
  ].join('\n');
};

/** Extracts a formatted address string from OSM tags, or null if insufficient data. */
const extractAddress = (tags: Record<string, string> | undefined): string | null => {
  if (!tags) return null;

  const parts: string[] = [];

  const street = tags['addr:street'];
  const houseNumber = tags['addr:housenumber'];
  if (street) {
    parts.push(houseNumber ? `${houseNumber} ${street}` : street);
  }

  const city = tags['addr:city'];
  if (city) {
    parts.push(city);
  }

  return parts.length > 0 ? parts.join(', ') : null;
};

/** Maps an OSM `museum` tag value to a normalized category. */
const classifyMuseumType = (tags: Record<string, string> | undefined): MuseumCategory => {
  const raw = tags?.museum ?? tags?.subject ?? '';
  const lower = raw.toLowerCase();

  if (['art', 'arts', 'fine_arts', 'modern_art', 'contemporary_art'].includes(lower)) return 'art';
  if (['history', 'archaeology', 'archaeological', 'local_history', 'ethnography'].includes(lower))
    return 'history';
  if (['science', 'technology', 'natural_history', 'natural', 'nature', 'geology'].includes(lower))
    return 'science';
  if (
    [
      'railway',
      'aviation',
      'maritime',
      'military',
      'transport',
      'industrial',
      'automobile',
    ].includes(lower)
  )
    return 'specialized';

  return 'general';
};

/** Parses a single Overpass element into a museum result, or null if unusable. */
const parseElement = (el: OverpassElement): OverpassMuseumResult | null => {
  const name = el.tags?.name;
  if (!name) return null;

  let latitude: number | undefined;
  let longitude: number | undefined;

  if (el.type === 'node') {
    latitude = el.lat;
    longitude = el.lon;
  } else {
    latitude = el.center?.lat;
    longitude = el.center?.lon;
  }

  if (latitude === undefined || longitude === undefined) return null;

  return {
    name,
    address: extractAddress(el.tags),
    latitude,
    longitude,
    osmId: el.id,
    museumType: classifyMuseumType(el.tags),
  };
};

/** POSTs a query to a single Overpass endpoint with timeout + User-Agent. */
async function postQuery(endpoint: string, query: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT,
      },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Executes the built Overpass query against a single endpoint and parses the result.
 * Returns null if the endpoint should be skipped (non-OK status or unexpected shape);
 * the caller then falls through to the next endpoint.
 *
 * @param endpoint - Overpass endpoint URL.
 * @param query - Pre-built Overpass QL query.
 * @param timeoutMs - HTTP request timeout in milliseconds.
 * @param q - Optional name-substring filter applied after parsing.
 * @returns Parsed museum results on success, or null to try next endpoint.
 */
async function fetchFromEndpoint(
  endpoint: string,
  query: string,
  timeoutMs: number,
  q: string | undefined,
): Promise<OverpassMuseumResult[] | null> {
  const response = await postQuery(endpoint, query, timeoutMs);

  if (!response.ok) {
    logger.warn('Overpass endpoint returned non-OK status — trying next', {
      endpoint,
      status: response.status,
      statusText: response.statusText,
    });
    return null;
  }

  const data = (await response.json()) as OverpassResponse;

  if (!Array.isArray(data.elements)) {
    logger.warn('Overpass endpoint returned unexpected response shape', { endpoint });
    return null;
  }

  const results: OverpassMuseumResult[] = data.elements
    .map(parseElement)
    .filter((r): r is OverpassMuseumResult => r !== null);

  if (q) {
    const lower = q.toLowerCase();
    return results.filter((r) => r.name.toLowerCase().includes(lower));
  }

  return results;
}

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
  const query = [
    `[out:json][timeout:${String(QL_TIMEOUT_SECONDS)}];`,
    `nwr["tourism"="museum"]["opening_hours"](around:${String(radius)},${String(params.lat)},${String(params.lng)});`,
    'out tags 1;',
  ].join('\n');

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
interface OverpassCacheEntry {
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
function buildOverpassCacheKey(params: OverpassSearchParams): string | null {
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
interface OverpassBackgroundRefreshArgs {
  cache: CacheService;
  params: OverpassSearchParams;
  cacheKey: string;
  positiveTtlSeconds: number;
  negativeTtlSeconds: number;
}

/**
 * Fires a background refresh of a soon-to-expire entry. Never throws — any
 * failure is swallowed and logged as a warning. Intended for use by the
 * probabilistic early-expiration path only.
 */
function fireOverpassBackgroundRefresh(args: OverpassBackgroundRefreshArgs): void {
  const { cache, params, cacheKey, positiveTtlSeconds, negativeTtlSeconds } = args;
  void (async () => {
    try {
      const fresh = await queryOverpassMuseums(params);
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
function shouldOverpassEarlyRefresh(entry: OverpassCacheEntry, nowMs: number): boolean {
  const elapsedMs = nowMs - entry.storedAtMs;
  const ttlMs = entry.ttlSeconds * 1_000;
  if (ttlMs <= 0) return false;
  const elapsedRatio = elapsedMs / ttlMs;
  if (elapsedRatio < EARLY_REFRESH_THRESHOLD) return false;
  // eslint-disable-next-line sonarjs/pseudo-random -- non-security: TTL jitter
  return Math.random() < (elapsedRatio - EARLY_REFRESH_THRESHOLD) / (1 - EARLY_REFRESH_THRESHOLD);
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
