import { openApiRequest } from '@/shared/api/openapiClient';
import type { ArtKeywordListResponse } from '../domain/contracts';

/** Fetches art keywords for a given locale, optionally filtering by last sync timestamp. */
export async function syncKeywords(
  locale: string,
  since?: string,
): Promise<ArtKeywordListResponse> {
  return openApiRequest({
    path: '/api/chat/art-keywords',
    method: 'get',
    query: { locale, since },
  });
}
