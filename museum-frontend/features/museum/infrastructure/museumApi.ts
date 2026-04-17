import { openApiRequest, type OpenApiResponseFor } from '@/shared/api/openapiClient';

/**
 * Museum API — migrated to `openApiRequest` with generated types, removing the
 * manually-maintained `MuseumDirectoryEntry`/`MuseumSearchEntry` interfaces that
 * were drifting from the backend OpenAPI spec.
 */

type DirectoryResponse = OpenApiResponseFor<'/api/museums/directory', 'get'>;
type GetMuseumResponse = OpenApiResponseFor<'/api/museums/{idOrSlug}', 'get'>;
type SearchResponse = OpenApiResponseFor<'/api/museums/search', 'get'>;

/** Public museum entry returned by the directory endpoint. */
export type MuseumDirectoryEntry = DirectoryResponse['museums'][number];

/** Entry returned by the search endpoint (includes OSM results without id/slug). */
export type MuseumSearchEntry = SearchResponse['museums'][number];

/** Single museum shape returned by GET /api/museums/{idOrSlug}. */
export type MuseumDetail = GetMuseumResponse['museum'];

/** Re-exported for backward compatibility with consumers that type against the category union. */
export type MuseumCategory = MuseumDirectoryEntry['museumType'];

/** Service for museum API operations. */
export const museumApi = {
  /**
   * Lists all active museums in the public directory.
   * @returns Array of museum directory entries.
   */
  async listMuseumDirectory(): Promise<MuseumDirectoryEntry[]> {
    const data = await openApiRequest({
      path: '/api/museums/directory',
      method: 'get',
    });
    return data.museums;
  },

  /**
   * Fetches a single museum by ID or slug.
   * @param idOrSlug - Museum numeric ID or slug string.
   * @returns The museum data.
   */
  async getMuseum(idOrSlug: string): Promise<MuseumDetail> {
    const data = await openApiRequest({
      path: '/api/museums/{idOrSlug}',
      method: 'get',
      pathParams: { idOrSlug },
    });
    return data.museum;
  },

  /**
   * Searches museums via the backend search endpoint. Two mutually-exclusive
   * geographic modes:
   *   - center+radius: pass `lat`, `lng`, and optional `radius` (meters)
   *   - bounding box: pass `bbox` as `[minLng, minLat, maxLng, maxLat]`
   * When both are provided, the backend uses the bbox.
   * @returns Search results with museum entries and total count.
   */
  async searchMuseums(params: {
    lat?: number;
    lng?: number;
    radius?: number;
    q?: string;
    bbox?: [number, number, number, number];
  }): Promise<{ museums: MuseumSearchEntry[]; count: number }> {
    const data = await openApiRequest({
      path: '/api/museums/search',
      method: 'get',
      query: {
        lat: params.lat,
        lng: params.lng,
        radius: params.radius,
        q: params.q,
        bbox: params.bbox ? params.bbox.join(',') : undefined,
      },
    });
    return { museums: data.museums, count: data.count };
  },
};
