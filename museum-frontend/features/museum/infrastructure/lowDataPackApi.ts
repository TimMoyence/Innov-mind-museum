import { openApiRequest, type OpenApiResponseFor } from '@/shared/api/openapiClient';

type LowDataPackResponse = OpenApiResponseFor<'/api/museums/{id}/low-data-pack', 'get'>;

export type LowDataPackEntry = LowDataPackResponse['entries'][number];

export type LowDataPack = LowDataPackResponse;

export async function fetchLowDataPack(museumId: string, locale: string): Promise<LowDataPack> {
  return openApiRequest({
    path: '/api/museums/{id}/low-data-pack',
    method: 'get',
    pathParams: { id: museumId },
    headers: { 'Accept-Language': locale },
  });
}
