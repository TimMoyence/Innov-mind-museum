import { httpRequest } from '@/shared/api/httpRequest';
import {
  openApiRequest,
  openApiRequestField,
  type OpenApiResponseFor,
} from '@/shared/api/openapiClient';

type DirectoryResponse = OpenApiResponseFor<'/api/museums/directory', 'get'>;
type GetMuseumResponse = OpenApiResponseFor<'/api/museums/{idOrSlug}', 'get'>;
type SearchResponse = OpenApiResponseFor<'/api/museums/search', 'get'>;
type DetectMuseumResponse = OpenApiResponseFor<'/api/museums/detect-museum', 'get'>;

export type MuseumDetectionResult = DetectMuseumResponse;

export type MuseumDirectoryEntry = DirectoryResponse['museums'][number];

export type MuseumSearchEntry = SearchResponse['museums'][number];

export type MuseumDetail = GetMuseumResponse['museum'];

export type MuseumCategory = MuseumDirectoryEntry['museumType'];

export type OpeningDay = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export type OpeningDayStatus = 'open' | 'closed' | 'unknown';

export interface ParsedOpeningDay {
  day: OpeningDay;
  opens: string | null;
  closes: string | null;
}

export interface ParsedOpeningHours {
  raw: string;
  status: OpeningDayStatus;
  statusReason: 'currently_open' | 'currently_closed' | 'unparseable' | 'no_data';
  closesAtLocal: string | null;
  opensAtLocal: string | null;
  weekly: ParsedOpeningDay[];
}

export interface MuseumEnrichmentView {
  museumId: number;
  locale: string;
  summary: string | null;
  wikidataQid: string | null;
  website: string | null;
  phone: string | null;
  imageUrl: string | null;
  openingHours: ParsedOpeningHours | null;
  admissionFees?: Record<string, unknown> | null;
  collections?: Record<string, unknown> | null;
  currentExhibitions?: Record<string, unknown> | null;
  accessibility?: Record<string, unknown> | null;
  fetchedAt: string;
}

export type MuseumEnrichmentResponse =
  | { status: 'ready'; data: MuseumEnrichmentView }
  | { status: 'pending'; jobId: string };

export const museumApi = {
  async listMuseumDirectory(opts?: { signal?: AbortSignal }): Promise<MuseumDirectoryEntry[]> {
    return openApiRequestField(
      { path: '/api/museums/directory', method: 'get', signal: opts?.signal },
      'museums',
    );
  },

  async getMuseum(idOrSlug: string): Promise<MuseumDetail> {
    return openApiRequestField(
      { path: '/api/museums/{idOrSlug}', method: 'get', pathParams: { idOrSlug } },
      'museum',
    );
  },

  async searchMuseums(
    params: {
      lat?: number;
      lng?: number;
      radius?: number;
      q?: string;
      bbox?: [number, number, number, number];
    },
    opts?: { signal?: AbortSignal },
  ): Promise<{ museums: MuseumSearchEntry[]; count: number }> {
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
      signal: opts?.signal,
    });
    return { museums: data.museums, count: data.count };
  },

  async detectMuseum(params: { lat: number; lng: number }): Promise<MuseumDetectionResult> {
    return openApiRequest({
      path: '/api/museums/detect-museum',
      method: 'get',
      query: {
        lat: params.lat,
        lng: params.lng,
      },
    });
  },

  async getEnrichment(museumId: number, locale: string): Promise<MuseumEnrichmentResponse> {
    const query = new URLSearchParams({ locale }).toString();
    return httpRequest<MuseumEnrichmentResponse>(
      `/api/museums/${encodeURIComponent(String(museumId))}/enrichment?${query}`,
    );
  },

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
