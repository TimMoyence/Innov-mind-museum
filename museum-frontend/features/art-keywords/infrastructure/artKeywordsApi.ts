import { openApiRequest } from '@/shared/api/openapiClient';
import { getLocale as sharedGetLocale } from '@/shared/infrastructure/httpClient';
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

/**
 * C1 hexagonal (2026-05-23) — feature-infra re-export of the runtime locale
 * getter. The application-layer hook `useArtKeywordsSync` previously imported
 * `getLocale` from the shared transport primitive directly ; it now reads it
 * through this façade so the hexagonal sentinel stays green.
 */
export const getLocale = (): string => sharedGetLocale();
