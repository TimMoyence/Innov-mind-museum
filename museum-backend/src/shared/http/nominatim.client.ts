import { logger } from '@shared/logger/logger';
import { getLangfuse } from '@shared/observability/langfuse.client';
import {
  nominatimRequestDurationSeconds,
  nominatimRequestsTotal,
} from '@shared/observability/prometheus-metrics';
import { safeTrace } from '@shared/observability/safeTrace';
import { env } from '@src/config/env';

import type { CacheService } from '@shared/cache/cache.port';

/**
 * Nominatim (OSM) HTTP adapter.
 *
 * Raw `geocodeWithNominatim` / `reverseGeocodeWithNominatim` enforce only transport-
 * level OSMF policy: global rate limiter (≥ `env.nominatim.minRequestIntervalMs`) +
 * required User-Agent. Production wiring SHOULD use `createCachedNominatimClient`
 * which layers OSMF mandatory caching (key shape, +/- TTLs, probabilistic refresh,
 * fail-open).
 */

export interface NominatimGeocodingResult {
  lat: number;
  lng: number;
}

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

export type CachedReverseGeocodeFn = (
  lat: number,
  lng: number,
) => Promise<NominatimReverseResult | null>;

interface NominatimResponseItem {
  lat: string;
  lon: string;
}

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
 * Promise-chained global rate limiter — OSMF Usage Policy caps clients at 1 req/s
 * absolute. Module singleton: every exported function funnels through it, so the
 * limit holds regardless of concurrent call-site count.
 */
class RateLimiter {
  private tail: Promise<void> = Promise.resolve();

  constructor(private readonly minIntervalMs: number) {}

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

/** OSMF bans stock UA strings — must identify app + reachable contact. */
function buildUserAgent(): string {
  return `Musaium/${env.appVersion} (contact: ${env.nominatim.contactEmail})`;
}

/** Returns `null` on any failure (fail-open). `timeoutMs` default 5000. */
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

function buildReverseUrl(lat: number, lng: number): URL {
  const url = new URL(NOMINATIM_REVERSE_URL);
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lng));
  url.searchParams.set('format', 'json');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('zoom', '18');
  return url;
}

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

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

interface ReverseFetchResult {
  outcome: 'hit' | 'miss' | 'error';
  value: NominatimReverseResult | null;
}

/** Core live fetch — split from the observability wrapper to keep function lengths bounded. */
async function fetchReverseLive(
  lat: number,
  lng: number,
  timeoutMs: number,
): Promise<ReverseFetchResult> {
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
        lat_3dec: round3(lat),
        lng_3dec: round3(lng),
      });
      return { outcome: 'error', value: null };
    }

    const data = (await response.json()) as NominatimReverseResponseItem;
    const mapped = mapReverseResponse(data);
    return { outcome: mapped ? 'hit' : 'miss', value: mapped };
  } catch (error) {
    logger.warn('Nominatim reverse geocoding failed', {
      error: error instanceof Error ? error.message : String(error),
      lat_3dec: round3(lat),
      lng_3dec: round3(lng),
    });
    return { outcome: 'error', value: null };
  }
}

/** Returns `null` on failure/empty (fail-open). `timeoutMs` default 5000. */
export async function reverseGeocodeWithNominatim(
  lat: number,
  lng: number,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<NominatimReverseResult | null> {
  const startedAtMs = Date.now();
  const span = safeTrace('geo.nominatim.reverse.start', () =>
    getLangfuse()?.span({
      name: 'geo.nominatim.reverse',
      input: { lat_3dec: round3(lat), lng_3dec: round3(lng), cached: false },
    }),
  );

  const { outcome, value } = await fetchReverseLive(lat, lng, timeoutMs);
  const latencyMs = Date.now() - startedAtMs;

  nominatimRequestsTotal.labels(outcome).inc();
  nominatimRequestDurationSeconds.observe(latencyMs / 1000);
  safeTrace('geo.nominatim.reverse.end', () => {
    span?.update({
      output: { outcome, cached: false, latency_ms: latencyMs },
    });
    span?.end();
  });

  return value;
}

/**
 * `value: null` is a SENTINEL (distinct from cache miss) — caches the empty live
 * response short-term to shield Nominatim from repeat misses. `storedAtMs` enables
 * probabilistic early expiration on the TTL-unaware cache port.
 */
interface ReverseGeocodeCacheEntry {
  value: NominatimReverseResult | null;
  storedAtMs: number;
  ttlSeconds: number;
}

/** Rounded to ~111m precision so GPS jitter doesn't produce new keys per chat message. */
function buildCacheKey(lat: number, lng: number): string {
  return `nominatim:rev:${lat.toFixed(CACHE_KEY_COORD_PRECISION)}:${lng.toFixed(
    CACHE_KEY_COORD_PRECISION,
  )}`;
}

interface BackgroundRefreshArgs {
  cache: CacheService;
  lat: number;
  lng: number;
  cacheKey: string;
  positiveTtlSeconds: number;
  negativeTtlSeconds: number;
}

/** Fire-and-forget. Never throws — failure logged as warning. */
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
 * Smooths thundering-herd at TTL expiry — late-window callers serve cached value
 * AND opportunistically refresh in background, so next cold miss is rare.
 */
function shouldEarlyRefresh(entry: ReverseGeocodeCacheEntry, nowMs: number): boolean {
  const elapsedMs = nowMs - entry.storedAtMs;
  const ttlMs = entry.ttlSeconds * 1_000;
  if (ttlMs <= 0) return false;
  const elapsedRatio = elapsedMs / ttlMs;
  // Stryker disable next-line ConditionalExpression,EqualityOperator,BooleanLiteral: removing the early-return or flipping < to <= is observationally equivalent — both paths yield false when the adjustment denominator is ≤ 0 (Math.random < non-positive always false). Same pattern as shared/http/overpass-cache.ts:113.
  if (elapsedRatio < EARLY_REFRESH_THRESHOLD) return false;
  // eslint-disable-next-line sonarjs/pseudo-random -- non-security: TTL jitter
  return Math.random() < (elapsedRatio - EARLY_REFRESH_THRESHOLD) / (1 - EARLY_REFRESH_THRESHOLD);
}

/**
 * OSMF mandatory caching. Key shape `nominatim:rev:<lat.toFixed(3)>:<lng.toFixed(3)>`.
 * Positive TTL `env.nominatim.cacheTtlSeconds` (default 24h); negative TTL
 * `env.nominatim.negativeCacheTtlSeconds` (default 1h) wraps sentinel `null`
 * (cache-miss vs cached-null unambiguous). Probabilistic refresh in last 10% TTL.
 * Fail-open: cache R/W errors logged + fall through to live call.
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
      // Cache hit — emit a lightweight span + counter so dashboards can show
      // hit-rate. Live-call counters are emitted inside reverseGeocodeWithNominatim.
      nominatimRequestsTotal.labels('cached').inc();
      safeTrace('geo.nominatim.reverse.cached', () => {
        getLangfuse()
          ?.span({
            name: 'geo.nominatim.reverse',
            input: { lat_3dec: round3(lat), lng_3dec: round3(lng), cached: true },
          })
          .update({ output: { outcome: 'cached', cached: true, latency_ms: 0 } })
          .end();
      });
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
