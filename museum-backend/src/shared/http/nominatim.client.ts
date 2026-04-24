import { logger } from '@shared/logger/logger';
import { env } from '@src/config/env';

import type { CacheService } from '@shared/cache/cache.port';

/**
 * Low-level Nominatim (OpenStreetMap) HTTP adapter.
 *
 * DDD note: the bare `geocodeWithNominatim` / `reverseGeocodeWithNominatim`
 * functions are the low-level adapter. They enforce ONLY the OSMF per-process
 * policy constraints that MUST be applied at the transport level:
 *   - A single global rate limiter (>= `env.nominatim.minRequestIntervalMs`
 *     between two outbound fetches from this Node process, per OSMF policy).
 *   - A valid User-Agent header identifying Musaium + a contact email.
 *
 * Application-level caching (key shape, positive/negative TTLs, probabilistic
 * early expiration, fail-open policy) is layered on top by the factory
 * `createCachedNominatimClient`, which is what call sites SHOULD use in
 * production wiring. The raw functions remain exported for non-cached uses
 * (e.g. one-shot geocoding of a free-text query) and to keep test-level
 * fetch-mocking ergonomic.
 */

/** Geocoding result from Nominatim. */
export interface NominatimGeocodingResult {
  lat: number;
  lng: number;
}

/** Reverse geocoding result from Nominatim. */
export interface NominatimReverseResult {
  displayName: string;
  address: {
    road?: string;
    neighbourhood?: string;
    suburb?: string;
    city?: string;
    country?: string;
  };
  name?: string;
}

/** Signature of a cached reverse-geocode function. */
export type CachedReverseGeocodeFn = (
  lat: number,
  lng: number,
) => Promise<NominatimReverseResult | null>;

interface NominatimResponseItem {
  lat: string;
  lon: string;
}

/** Nominatim reverse API response shape. */
interface NominatimReverseResponseItem {
  display_name: string;
  name?: string;
  address?: {
    road?: string;
    neighbourhood?: string;
    suburb?: string;
    city?: string;
    town?: string;
    village?: string;
    country?: string;
  };
}

const NOMINATIM_API_URL = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';
const DEFAULT_TIMEOUT_MS = 5_000;
const CACHE_KEY_COORD_PRECISION = 3;
const EARLY_REFRESH_THRESHOLD = 0.9;

/**
 * Promise-chained global rate limiter enforcing >= `minIntervalMs`
 * between any two outbound Nominatim fetches in this Node process.
 *
 * OSMF Usage Policy explicitly caps clients at 1 req/s absolute.
 * This is intentionally a module singleton: every exported function
 * in this file funnels through it, so the limit is enforced regardless
 * of how many call sites fire concurrently.
 */
class RateLimiter {
  private tail: Promise<void> = Promise.resolve();

  constructor(private readonly minIntervalMs: number) {}

  /**
   * Acquires a slot in the rate limiter. Resolves once `minIntervalMs`
   * has elapsed since the previous acquisition completed its own wait.
   */
  async acquire(): Promise<void> {
    const previousTail = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previousTail;
    try {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, this.minIntervalMs);
      });
    } finally {
      release();
    }
  }
}

const rateLimiter = new RateLimiter(env.nominatim.minRequestIntervalMs);

/**
 * Builds the Nominatim User-Agent header per OSMF policy.
 *
 * Format: `Musaium/<appVersion> (contact: <email>)`
 *
 * OSMF explicitly bans stock-library User-Agent strings; ours must
 * identify both the application and a reachable operator contact.
 */
function buildUserAgent(): string {
  return `Musaium/${env.appVersion} (contact: ${env.nominatim.contactEmail})`;
}

/**
 * Geocodes a text query to coordinates via the Nominatim (OpenStreetMap) API.
 * Returns the first result as `{ lat, lng }`, or `null` if no result or on failure.
 *
 * @param query - Free-text location query (e.g. "Lyon", "Bordeaux").
 * @param timeoutMs - HTTP request timeout in milliseconds (default 5000).
 * @returns Geocoded coordinates or null.
 */
export async function geocodeWithNominatim(
  query: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<NominatimGeocodingResult | null> {
  try {
    const url = new URL(NOMINATIM_API_URL);
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', '1');
    url.searchParams.set('accept-language', 'fr');

    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    await rateLimiter.acquire();

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        method: 'GET',
        headers: { 'User-Agent': buildUserAgent() },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      logger.warn('Nominatim API returned non-OK status', {
        status: response.status,
        statusText: response.statusText,
      });
      return null;
    }

    const data = (await response.json()) as NominatimResponseItem[];

    if (!Array.isArray(data) || data.length === 0) {
      return null;
    }

    const first = data[0];
    const lat = Number.parseFloat(first.lat);
    const lng = Number.parseFloat(first.lon);

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      logger.warn('Nominatim returned unparseable coordinates', { raw: first });
      return null;
    }

    return { lat, lng };
  } catch (error) {
    logger.warn('Nominatim geocoding failed', {
      error: error instanceof Error ? error.message : String(error),
      query,
    });
    return null;
  }
}

/**
 * Builds the Nominatim reverse geocoding URL for the given coordinates.
 */
function buildReverseUrl(lat: number, lng: number): URL {
  const url = new URL(NOMINATIM_REVERSE_URL);
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lng));
  url.searchParams.set('format', 'json');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('zoom', '18');
  return url;
}

/**
 * Maps a raw Nominatim reverse API response into the typed result shape.
 */
function mapReverseResponse(data: NominatimReverseResponseItem): NominatimReverseResult | null {
  if (!data.display_name) return null;
  const city = data.address?.city ?? data.address?.town ?? data.address?.village;
  return {
    displayName: data.display_name,
    address: {
      road: data.address?.road,
      neighbourhood: data.address?.neighbourhood,
      suburb: data.address?.suburb,
      city,
      country: data.address?.country,
    },
    name: data.name ?? undefined,
  };
}

/**
 * Reverse geocodes coordinates to a street-level address via the Nominatim API.
 * Returns structured address data, or `null` on failure/empty result.
 *
 * @param lat - Latitude of the point to reverse geocode.
 * @param lng - Longitude of the point to reverse geocode.
 * @param timeoutMs - HTTP request timeout in milliseconds (default 5000).
 * @returns Reverse geocoding result or null.
 */
export async function reverseGeocodeWithNominatim(
  lat: number,
  lng: number,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<NominatimReverseResult | null> {
  try {
    const url = buildReverseUrl(lat, lng);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    await rateLimiter.acquire();

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        method: 'GET',
        headers: { 'User-Agent': buildUserAgent() },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      logger.warn('Nominatim reverse API returned non-OK status', {
        status: response.status,
        statusText: response.statusText,
      });
      return null;
    }

    const data = (await response.json()) as NominatimReverseResponseItem;
    return mapReverseResponse(data);
  } catch (error) {
    logger.warn('Nominatim reverse geocoding failed', {
      error: error instanceof Error ? error.message : String(error),
      lat,
      lng,
    });
    return null;
  }
}

/**
 * Cache envelope wrapping a value + the epoch (ms) at which it was stored.
 * We store the timestamp alongside the value so we can implement probabilistic
 * early expiration in a TTL-unaware cache port (Redis tells us it exists, not
 * how much of its TTL has elapsed).
 *
 * `value: null` is a SENTINEL — distinct from a cache miss. It means the live
 * call returned null (unknown location / empty response) and we cached that
 * short-term to shield Nominatim from repeated misses on the same coordinate.
 */
interface ReverseGeocodeCacheEntry {
  value: NominatimReverseResult | null;
  storedAtMs: number;
  ttlSeconds: number;
}

/**
 * Builds the positive-cache key for a given coordinate pair.
 *
 * Rounded to {@link CACHE_KEY_COORD_PRECISION} decimal places (~111m at the
 * equator) so tiny GPS jitter doesn't produce new keys on every chat message.
 */
function buildCacheKey(lat: number, lng: number): string {
  return `nominatim:rev:${lat.toFixed(CACHE_KEY_COORD_PRECISION)}:${lng.toFixed(
    CACHE_KEY_COORD_PRECISION,
  )}`;
}

/** Arguments for the background refresh helper. Bagged to stay under max-params: 5. */
interface BackgroundRefreshArgs {
  cache: CacheService;
  lat: number;
  lng: number;
  cacheKey: string;
  positiveTtlSeconds: number;
  negativeTtlSeconds: number;
}

/**
 * Fires a background refresh of a soon-to-expire entry. Never throws — any
 * failure is swallowed and logged as a warning. Intended for use by the
 * probabilistic early-expiration path only.
 */
function fireBackgroundRefresh(args: BackgroundRefreshArgs): void {
  const { cache, lat, lng, cacheKey, positiveTtlSeconds, negativeTtlSeconds } = args;
  void (async () => {
    try {
      const fresh = await reverseGeocodeWithNominatim(lat, lng);
      const entry: ReverseGeocodeCacheEntry = {
        value: fresh,
        storedAtMs: Date.now(),
        ttlSeconds: fresh ? positiveTtlSeconds : negativeTtlSeconds,
      };
      await cache.set(cacheKey, entry, entry.ttlSeconds);
    } catch (error) {
      logger.warn('Nominatim background refresh failed', {
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
 * This smooths out the thundering-herd at TTL expiry: callers late in the
 * window serve the cached value *and* opportunistically refresh it in the
 * background, so the next cold miss is rare.
 */
function shouldEarlyRefresh(entry: ReverseGeocodeCacheEntry, nowMs: number): boolean {
  const elapsedMs = nowMs - entry.storedAtMs;
  const ttlMs = entry.ttlSeconds * 1_000;
  if (ttlMs <= 0) return false;
  const elapsedRatio = elapsedMs / ttlMs;
  if (elapsedRatio < EARLY_REFRESH_THRESHOLD) return false;
  // eslint-disable-next-line sonarjs/pseudo-random -- non-security: TTL jitter
  return Math.random() < (elapsedRatio - EARLY_REFRESH_THRESHOLD) / (1 - EARLY_REFRESH_THRESHOLD);
}

/**
 * Builds a reverse-geocode function that is cached against the given
 * {@link CacheService}, enforcing the OSMF mandatory-caching policy.
 *
 * Behaviour:
 *   - Cache key: `nominatim:rev:<lat.toFixed(3)>:<lng.toFixed(3)>` — rounded
 *     coordinates absorb GPS jitter between consecutive chat messages.
 *   - Positive TTL: `env.nominatim.cacheTtlSeconds` (default 24h).
 *   - Negative TTL: `env.nominatim.negativeCacheTtlSeconds` (default 1h), with
 *     a sentinel-wrapped `null` so cache miss vs. cached-null is unambiguous.
 *   - Probabilistic early expiration: in the last 10% of TTL, a weighted coin
 *     flip fires a background refresh (fail-silent).
 *   - Fail-open: any cache read/write error is logged as a warning and the
 *     live call proceeds — availability > cache coherence for this adapter.
 *
 * @param cache - CacheService implementation (Redis in prod, memory in tests).
 * @returns A function `(lat, lng) => Promise<NominatimReverseResult | null>`.
 */
export function createCachedNominatimClient(cache: CacheService): CachedReverseGeocodeFn {
  const positiveTtlSeconds = env.nominatim.cacheTtlSeconds;
  const negativeTtlSeconds = env.nominatim.negativeCacheTtlSeconds;

  return async function cachedReverseGeocode(
    lat: number,
    lng: number,
  ): Promise<NominatimReverseResult | null> {
    const cacheKey = buildCacheKey(lat, lng);

    let cached: ReverseGeocodeCacheEntry | null = null;
    try {
      cached = await cache.get<ReverseGeocodeCacheEntry>(cacheKey);
    } catch (error) {
      logger.warn('Nominatim cache read failed, falling back to live', {
        error: error instanceof Error ? error.message : String(error),
        cacheKey,
      });
    }

    if (cached) {
      if (shouldEarlyRefresh(cached, Date.now())) {
        fireBackgroundRefresh({
          cache,
          lat,
          lng,
          cacheKey,
          positiveTtlSeconds,
          negativeTtlSeconds,
        });
      }
      return cached.value;
    }

    const live = await reverseGeocodeWithNominatim(lat, lng);
    const entry: ReverseGeocodeCacheEntry = {
      value: live,
      storedAtMs: Date.now(),
      ttlSeconds: live ? positiveTtlSeconds : negativeTtlSeconds,
    };

    try {
      await cache.set(cacheKey, entry, entry.ttlSeconds);
    } catch (error) {
      logger.warn('Nominatim cache write failed, serving live result', {
        error: error instanceof Error ? error.message : String(error),
        cacheKey,
      });
    }

    return live;
  };
}
