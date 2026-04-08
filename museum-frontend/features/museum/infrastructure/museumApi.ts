import { httpRequest } from '@/shared/api/httpRequest';

const MUSEUM_BASE = '/api/museums';

/** Normalized museum category derived from OSM tags or stored in the DB. */
export type MuseumCategory = 'art' | 'history' | 'science' | 'specialized' | 'general';

/** Public museum entry returned by the directory endpoint. */
export interface MuseumDirectoryEntry {
  id: number;
  name: string;
  slug: string;
  address: string | null;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  museumType: MuseumCategory;
}

/** Entry returned by the search endpoint (includes OSM results without id/slug). */
export interface MuseumSearchEntry {
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  distance: number;
  source: 'local' | 'osm';
  museumType: MuseumCategory;
}

/** Response shape for GET /api/museums/search. */
interface MuseumSearchResponse {
  museums: MuseumSearchEntry[];
  count: number;
}

/** Response shape for GET /api/museums/directory. */
interface MuseumDirectoryResponse {
  museums: MuseumDirectoryEntry[];
}

/** Response shape for GET /api/museums/:idOrSlug. */
interface GetMuseumResponse {
  museum: MuseumDirectoryEntry & {
    config: Record<string, unknown>;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
  };
}

/** Service for museum API operations. */
export const museumApi = {
  /**
   * Lists all active museums in the public directory.
   * @returns Array of museum directory entries.
   */
  async listMuseumDirectory(): Promise<MuseumDirectoryEntry[]> {
    const data = await httpRequest<MuseumDirectoryResponse>(`${MUSEUM_BASE}/directory`, {
      method: 'GET',
    });
    return data.museums;
  },

  /**
   * Fetches a single museum by ID or slug.
   * @param idOrSlug - Museum numeric ID or slug string.
   * @returns The museum data.
   */
  async getMuseum(idOrSlug: string): Promise<GetMuseumResponse['museum']> {
    const data = await httpRequest<GetMuseumResponse>(
      `${MUSEUM_BASE}/${encodeURIComponent(idOrSlug)}`,
      { method: 'GET' },
    );
    return data.museum;
  },

  /**
   * Searches museums near a geographic point using the backend search endpoint.
   * Returns results sorted by distance, including OSM entries.
   * @param params - Search parameters: lat, lng, optional radius (meters), optional text query.
   * @returns Search results with museum entries and total count.
   */
  async searchMuseums(params: {
    lat?: number;
    lng?: number;
    radius?: number;
    q?: string;
  }): Promise<{ museums: MuseumSearchEntry[]; count: number }> {
    const searchParams = new URLSearchParams();
    if (params.lat !== undefined) searchParams.set('lat', String(params.lat));
    if (params.lng !== undefined) searchParams.set('lng', String(params.lng));
    if (params.radius !== undefined) searchParams.set('radius', String(params.radius));
    if (params.q) searchParams.set('q', params.q);

    const data = await httpRequest<MuseumSearchResponse>(
      `${MUSEUM_BASE}/search?${searchParams.toString()}`,
      { method: 'GET' },
    );
    return { museums: data.museums, count: data.count };
  },
};
