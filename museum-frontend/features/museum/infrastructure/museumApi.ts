import { httpRequest } from '@/shared/api/httpRequest';

const MUSEUM_BASE = '/api/museums';

/** Public museum entry returned by the directory endpoint. */
export interface MuseumDirectoryEntry {
  id: number;
  name: string;
  slug: string;
  address: string | null;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
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
    const data = await httpRequest<MuseumDirectoryResponse>(
      `${MUSEUM_BASE}/directory`,
      { method: 'GET' },
    );
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
};
