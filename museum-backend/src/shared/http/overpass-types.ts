/** Normalized museum category derived from OSM tags or stored in the DB. */
export const MUSEUM_CATEGORIES = ['art', 'history', 'science', 'specialized', 'general'] as const;

/** Discrete museum category values. */
export type MuseumCategory = (typeof MUSEUM_CATEGORIES)[number];

/** Raw museum result parsed from the Overpass API response. */
export interface OverpassMuseumResult {
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  osmId: number;
  museumType: MuseumCategory;
  /**
   * Optional metadata harvested directly from OSM tags on the search element.
   * Surfaced so the search response is richer without waiting for the async
   * enrichment pipeline. All fields are optional — missing tags map to
   * `undefined` and are stripped by the JSON serializer.
   */
  openingHours?: string;
  website?: string;
  phone?: string;
  imageUrl?: string;
  description?: string;
  /** Raw OSM `wheelchair` value: `yes` | `no` | `limited` | `designated`. */
  wheelchair?: string;
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

/** Element shape returned by the Overpass API. Internal to the parser. */
export interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/** Top-level Overpass API response shape. */
export interface OverpassResponse {
  elements: OverpassElement[];
}
