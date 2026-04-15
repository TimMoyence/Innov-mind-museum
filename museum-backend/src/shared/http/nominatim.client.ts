import { logger } from '@shared/logger/logger';

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

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        method: 'GET',
        headers: { 'User-Agent': 'Musaium/1.0' },
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

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        method: 'GET',
        headers: { 'User-Agent': 'Musaium/1.0' },
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
