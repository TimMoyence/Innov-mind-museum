import { openApiRequest, type OpenApiResponseFor } from '@/shared/api/openapiClient';

type LowDataPackResponse = OpenApiResponseFor<'/api/museums/{id}/low-data-pack', 'get'>;

/** Single Q&A entry in the low-data pack (derived from the generated OpenAPI types). */
export type LowDataPackEntry = LowDataPackResponse['entries'][number];

/** Full low-data pack shape (derived from the generated OpenAPI types). */
export type LowDataPack = LowDataPackResponse;

/**
 * Fetches the pre-built low-data pack for a museum.
 * Returns the most popular cached Q&A pairs so the client can serve
 * them offline or on slow networks without hitting the LLM.
 * @param museumId - Museum identifier (numeric id).
 * @param locale - User locale for localised answers.
 * @returns The low-data pack with cached entries.
 */
export async function fetchLowDataPack(museumId: string, locale: string): Promise<LowDataPack> {
  return openApiRequest({
    path: '/api/museums/{id}/low-data-pack',
    method: 'get',
    pathParams: { id: museumId },
    headers: { 'Accept-Language': locale },
  });
}
