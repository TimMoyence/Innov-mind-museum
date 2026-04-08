import { logger } from '@shared/logger/logger';

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

/** Parameters for querying nearby museums via Overpass. */
interface OverpassSearchParams {
  lat: number;
  lng: number;
  radiusMeters: number;
  /** Optional text filter applied to museum names after fetch. */
  q?: string;
}

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

const OVERPASS_API_URL = 'https://overpass-api.de/api/interpreter';
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Builds an Overpass QL query for museums within a radius of a given point.
 * Queries nodes, ways, and relations tagged with tourism=museum.
 */
const buildQuery = (lat: number, lng: number, radiusMeters: number): string => {
  const timeoutSeconds = String(Math.ceil(DEFAULT_TIMEOUT_MS / 1000));
  const r = String(radiusMeters);
  const coords = `${String(lat)},${String(lng)}`;
  const around = `(around:${r},${coords})`;
  return [
    `[out:json][timeout:${timeoutSeconds}];`,
    '(',
    `  node["tourism"="museum"]${around};`,
    `  way["tourism"="museum"]${around};`,
    `  relation["tourism"="museum"]${around};`,
    ');',
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

/**
 * Queries the Overpass API for museums near a given location.
 * Returns an empty array on any failure (network, parse, timeout).
 *
 * @param params - Search parameters including coordinates, radius, and optional text filter.
 * @param timeoutMs - HTTP request timeout in milliseconds (default 10000).
 * @returns Array of parsed museum results.
 */
export async function queryOverpassMuseums(
  params: OverpassSearchParams,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<OverpassMuseumResult[]> {
  const { lat, lng, radiusMeters, q } = params;

  try {
    const query = buildQuery(lat, lng, radiusMeters);

    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    let response: Response;
    try {
      response = await fetch(OVERPASS_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      logger.warn('Overpass API returned non-OK status', {
        status: response.status,
        statusText: response.statusText,
      });
      return [];
    }

    const data = (await response.json()) as OverpassResponse;

    if (!Array.isArray(data.elements)) {
      logger.warn('Overpass API returned unexpected response shape');
      return [];
    }

    let results: OverpassMuseumResult[] = data.elements
      .map(parseElement)
      .filter((r): r is OverpassMuseumResult => r !== null);

    if (q) {
      const lower = q.toLowerCase();
      results = results.filter((r) => r.name.toLowerCase().includes(lower));
    }

    return results;
  } catch (error) {
    logger.warn('Overpass API query failed', {
      error: error instanceof Error ? error.message : String(error),
      lat,
      lng,
      radiusMeters,
    });
    return [];
  }
}
