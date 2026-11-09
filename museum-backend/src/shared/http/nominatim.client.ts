import {
  createBackgroundRefresh,
  OUTAGE_CACHE_TTL_SECONDS,
  shouldEarlyRefresh,
  type RefreshableEntry,
} from '@shared/cache/probabilistic-refresh';
import { errorMessage } from '@shared/errors/error-message';
import { logger } from '@shared/logger/logger';
import { env } from '@src/config/env';

import type { CacheService } from '@shared/cache/cache.port';

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

function buildUserAgent(): string {
  return `Musaium/${env.appVersion} (contact: ${env.nominatim.contactEmail})`;
}

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
      error: errorMessage(error),
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
      error: errorMessage(error),
      lat_3dec: round3(lat),
      lng_3dec: round3(lng),
    });
    return { outcome: 'error', value: null };
  }
}

export async function reverseGeocodeWithNominatim(
  lat: number,
  lng: number,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<NominatimReverseResult | null> {
  const { value } = await fetchReverseLive(lat, lng, timeoutMs);
  return value;
}

async function reverseGeocodeOrThrow(
  lat: number,
  lng: number,
): Promise<NominatimReverseResult | null> {
  const { outcome, value } = await fetchReverseLive(lat, lng, DEFAULT_TIMEOUT_MS);
  if (outcome === 'error') throw new Error('nominatim_unavailable');
  return value;
}

type ReverseGeocodeCacheEntry = RefreshableEntry<NominatimReverseResult | null>;

function buildCacheKey(lat: number, lng: number): string {
  return `nominatim:rev:${lat.toFixed(CACHE_KEY_COORD_PRECISION)}:${lng.toFixed(
    CACHE_KEY_COORD_PRECISION,
  )}`;
}

function buildNominatimBackgroundRefresh(cache: CacheService) {
  return createBackgroundRefresh<NominatimReverseResult | null>({
    cache,
    logger,
    opName: 'nominatim.background-refresh',
    failureMessage: 'Nominatim background refresh failed',
    isEmpty: (value) => value == null,
  });
}

export function createCachedNominatimClient(cache: CacheService): CachedReverseGeocodeFn {
  const positiveTtlSeconds = env.nominatim.cacheTtlSeconds;
  const negativeTtlSeconds = env.nominatim.negativeCacheTtlSeconds;
  const triggerBackgroundRefresh = buildNominatimBackgroundRefresh(cache);

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
        error: errorMessage(error),
        cacheKey,
      });
    }

    if (cached) {
      if (shouldEarlyRefresh(cached, Date.now())) {
        triggerBackgroundRefresh({
          cacheKey,
          refresh: () => reverseGeocodeOrThrow(lat, lng),
          positiveTtlSeconds,
          negativeTtlSeconds,
        });
      }
      return cached.value;
    }

    let live: NominatimReverseResult | null;
    let ttlSeconds: number;
    try {
      live = await reverseGeocodeOrThrow(lat, lng);
      ttlSeconds = live ? positiveTtlSeconds : negativeTtlSeconds;
    } catch {
      live = null;
      ttlSeconds = OUTAGE_CACHE_TTL_SECONDS;
    }
    const entry: ReverseGeocodeCacheEntry = { value: live, storedAtMs: Date.now(), ttlSeconds };

    try {
      await cache.set(cacheKey, entry, entry.ttlSeconds);
    } catch (error) {
      logger.warn('Nominatim cache write failed, serving live result', {
        error: errorMessage(error),
        cacheKey,
      });
    }

    return live;
  };
}
