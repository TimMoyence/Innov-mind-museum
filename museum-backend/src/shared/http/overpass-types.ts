export const MUSEUM_CATEGORIES = ['art', 'history', 'science', 'specialized', 'general'] as const;

export type MuseumCategory = (typeof MUSEUM_CATEGORIES)[number];

export interface OverpassMuseumResult {
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  osmId: number;
  museumType: MuseumCategory;
  openingHours?: string;
  website?: string;
  phone?: string;
  imageUrl?: string;
  description?: string;
  /** Raw OSM `wheelchair`: yes | no | limited | designated. */
  wheelchair?: string;
}

/** WGS84 bbox `[minLng, minLat, maxLng, maxLat]`. */
export type OverpassBoundingBox = [number, number, number, number];

/** Either center+radius OR `bbox` required. `bbox` takes precedence when both set. */
export interface OverpassSearchParams {
  lat?: number;
  lng?: number;
  radiusMeters?: number;
  bbox?: OverpassBoundingBox;
  q?: string;
}

export type CachedOverpassSearchFn = (
  params: OverpassSearchParams,
) => Promise<OverpassMuseumResult[]>;

export interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export interface OverpassResponse {
  elements: OverpassElement[];
}
