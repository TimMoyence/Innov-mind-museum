import { logger } from '@shared/logger/logger';

/** Geocoding result from Nominatim. */
export interface NominatimGeocodingResult {
  lat: number;
  lng: number;
}

interface NominatimResponseItem {
  lat: string;
  lon: string;
}

const NOMINATIM_API_URL = 'https://nominatim.openstreetmap.org/search';
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
