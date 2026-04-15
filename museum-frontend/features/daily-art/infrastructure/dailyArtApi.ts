import { openApiRequest, type OpenApiResponseFor } from '@/shared/api/openapiClient';

type DailyArtResponse = OpenApiResponseFor<'/api/daily-art', 'get'>;

/** Public shape of a daily-art artwork (derived from the generated OpenAPI types). */
export type DailyArtwork = DailyArtResponse['artwork'];

/** Fetches the daily artwork from the backend. */
export const fetchDailyArt = async (locale = 'en'): Promise<DailyArtwork> => {
  const data = await openApiRequest({
    path: '/api/daily-art',
    method: 'get',
    query: { locale },
  });
  return data.artwork;
};
