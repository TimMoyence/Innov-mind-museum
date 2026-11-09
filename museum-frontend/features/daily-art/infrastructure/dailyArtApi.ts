import { openApiRequestField, type OpenApiResponseFor } from '@/shared/api/openapiClient';

type DailyArtResponse = OpenApiResponseFor<'/api/daily-art', 'get'>;

export type DailyArtwork = DailyArtResponse['artwork'];

export const fetchDailyArt = async (locale = 'en'): Promise<DailyArtwork> =>
  openApiRequestField({ path: '/api/daily-art', method: 'get', query: { locale } }, 'artwork');
