import { httpRequest } from '@/shared/api/httpRequest';

export interface LowDataPackEntry {
  question: string;
  answer: string;
  metadata?: Record<string, unknown>;
  hits?: number;
  source: 'cache' | 'seeded';
}

export interface LowDataPack {
  museumId: string;
  locale: string;
  generatedAt: string;
  entries: LowDataPackEntry[];
}

/**
 * Fetches the pre-built low-data pack for a museum.
 * Returns the most popular cached Q&A pairs so the client can serve
 * them offline or on slow networks without hitting the LLM.
 * @param museumId - Museum identifier (slug or numeric ID as string).
 * @param locale - User locale for localised answers.
 * @returns The low-data pack with cached entries.
 */
export async function fetchLowDataPack(museumId: string, locale: string): Promise<LowDataPack> {
  return httpRequest<LowDataPack>(`/api/museums/${encodeURIComponent(museumId)}/low-data-pack`, {
    method: 'GET',
    headers: { 'Accept-Language': locale },
  });
}
