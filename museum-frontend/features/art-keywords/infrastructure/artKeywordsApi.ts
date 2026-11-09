import { openApiRequest } from '@/shared/api/openapiClient';
import { getLocale as sharedGetLocale } from '@/shared/infrastructure/httpClient';
import type { ArtKeywordListResponse } from '../domain/contracts';

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

export const getLocale = (): string => sharedGetLocale();
