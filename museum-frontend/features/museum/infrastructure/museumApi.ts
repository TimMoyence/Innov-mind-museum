import { httpRequest } from '@/shared/api/httpRequest';
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

/**
 * Enrichment types — mirrored from the backend `enrichment.types.ts` domain.
 *
 * Kept as a local definition because the BE hand-maintained OpenAPI spec at
 * `museum-backend/openapi/openapi.json` does not yet expose the
 * `/api/museums/:id/enrichment[/status]` endpoints. Once the BE spec includes
 * them, regenerate via `npm run generate:openapi-types` and swap these for
 * `OpenApiResponseFor<...>` aliases.
 */

/** Day-of-week short codes used by the OSM opening-hours parser. */
export type OpeningDay = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

/** High-level status derived from the weekly schedule + current time. */
export type OpeningDayStatus = 'open' | 'closed' | 'unknown';

/** One weekly row (null opens/closes = closed that day). */
export interface ParsedOpeningDay {
  day: OpeningDay;
  /** `HH:mm` local time, or null when closed that day. */
  opens: string | null;
  /** `HH:mm` local time, or null when closed that day. */
  closes: string | null;
}

/** Parsed OSM `opening_hours` tag, as returned by the BE. */
export interface ParsedOpeningHours {
  raw: string;
  status: OpeningDayStatus;
  statusReason: 'currently_open' | 'currently_closed' | 'unparseable' | 'no_data';
  /** `HH:mm` local time the museum closes today, or null. */
  closesAtLocal: string | null;
  /** `HH:mm` local time the museum opens today, or null. */
  opensAtLocal: string | null;
  /** Full week schedule (Mon→Sun). */
  weekly: ParsedOpeningDay[];
}

/** Projection exposed to mobile clients by `GET /api/museums/:id/enrichment`. */
export interface MuseumEnrichmentView {
  museumId: number;
  locale: string;
  summary: string | null;
  wikidataQid: string | null;
  website: string | null;
  phone: string | null;
  imageUrl: string | null;
  openingHours: ParsedOpeningHours | null;
  /** ISO-8601 timestamp — when the BE persisted this enrichment row. */
  fetchedAt: string;
}

/** Discriminated union returned by both enrichment endpoints. */
export type MuseumEnrichmentResponse =
  | { status: 'ready'; data: MuseumEnrichmentView }
  | { status: 'pending'; jobId: string };

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

  /**
   * Fetches cached enrichment (Wikidata + OSM) for a museum in the given locale.
   * The endpoint is non-blocking: a `pending` response means the BE has queued
   * an async refresh — the caller should poll `getEnrichmentStatus` with the
   * returned `jobId` until a `ready` response lands (or a timeout elapses).
   *
   * @param museumId - Numeric museum id (must be > 0).
   * @param locale - BCP-47 locale, e.g. `'fr'` or `'en'`.
   */
  async getEnrichment(museumId: number, locale: string): Promise<MuseumEnrichmentResponse> {
    const query = new URLSearchParams({ locale }).toString();
    return httpRequest<MuseumEnrichmentResponse>(
      `/api/museums/${encodeURIComponent(String(museumId))}/enrichment?${query}`,
    );
  },

  /**
   * Polls the status of a previously-issued async enrichment refresh. Same
   * discriminated response as {@link getEnrichment}.
   */
  async getEnrichmentStatus(
    museumId: number,
    locale: string,
    jobId: string,
  ): Promise<MuseumEnrichmentResponse> {
    const query = new URLSearchParams({ locale, jobId }).toString();
    return httpRequest<MuseumEnrichmentResponse>(
      `/api/museums/${encodeURIComponent(String(museumId))}/enrichment/status?${query}`,
    );
  },
};
