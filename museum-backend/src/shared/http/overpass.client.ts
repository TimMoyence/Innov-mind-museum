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

/**
 * Ordered list of Overpass API endpoints tried in sequence on failure.
 * - Main instance: overpass-api.de (primary)
 * - Kumi Systems: kumi.systems (fast mirror, community-funded)
 */
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const DEFAULT_TIMEOUT_MS = 30_000;
/** Overpass QL server-side timeout directive (must be ≤ client timeout). */
const QL_TIMEOUT_SECONDS = 25;
/**
 * Identifying User-Agent per OSM Operations convention
 * (https://operations.osmfoundation.org/policies/api/).
 * A real contact is required so OSM admins can reach us if we misbehave.
 */
const USER_AGENT = 'Musaium/1.0 (+https://musaium.com; contact@musaium.com)';

/**
 * Builds an Overpass QL query for museums within a radius of a given point.
 * Uses the `nwr` shortcut (node+way+relation in one pass) — ~4x faster than
 * a 3-query union on dense areas like Paris or Bordeaux, which was causing
 * server-side 504s with the previous implementation.
 */
const buildQuery = (lat: number, lng: number, radiusMeters: number): string => {
  const r = String(radiusMeters);
  const coords = `${String(lat)},${String(lng)}`;
  return [
    `[out:json][timeout:${String(QL_TIMEOUT_SECONDS)}];`,
    `nwr["tourism"="museum"](around:${r},${coords});`,
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
 * Queries the Overpass API for museums near a given location.
 * Tries endpoints in order (main → Kumi mirror) and returns the first success.
 * Returns an empty array on full failure (all endpoints failed).
 *
 * @param params - Search parameters including coordinates, radius, and optional text filter.
 * @param timeoutMs - HTTP request timeout per endpoint in milliseconds (default 30000).
 * @returns Array of parsed museum results.
 */
export async function queryOverpassMuseums(
  params: OverpassSearchParams,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<OverpassMuseumResult[]> {
  const { lat, lng, radiusMeters, q } = params;
  const query = buildQuery(lat, lng, radiusMeters);

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await postQuery(endpoint, query, timeoutMs);

      if (!response.ok) {
        logger.warn('Overpass endpoint returned non-OK status — trying next', {
          endpoint,
          status: response.status,
          statusText: response.statusText,
        });
        continue;
      }

      const data = (await response.json()) as OverpassResponse;

      if (!Array.isArray(data.elements)) {
        logger.warn('Overpass endpoint returned unexpected response shape', { endpoint });
        continue;
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
      logger.warn('Overpass endpoint query failed — trying next', {
        endpoint,
        error: error instanceof Error ? error.message : String(error),
        lat,
        lng,
        radiusMeters,
      });
    }
  }

  logger.warn('All Overpass endpoints failed', { lat, lng, radiusMeters });
  return [];
}
