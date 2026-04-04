import type { components } from '@/shared/api/generated/openapi';

export type ArtKeywordDTO = components['schemas']['ArtKeywordDTO'];
export type ArtKeywordListResponse = components['schemas']['ArtKeywordListResponse'];

export interface ArtKeywordsSyncState {
  /** Keywords indexed by locale for quick lookup. */
  keywordsByLocale: Record<string, ArtKeywordDTO[]>;
  /** ISO timestamp of the last successful sync per locale. */
  lastSyncedAt: Record<string, string>;
}
