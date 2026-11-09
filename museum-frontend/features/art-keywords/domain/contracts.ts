import type { components } from '@/shared/api/generated/openapi';

export type ArtKeywordDTO = components['schemas']['ArtKeywordDTO'];
export type ArtKeywordListResponse = components['schemas']['ArtKeywordListResponse'];

export interface ArtKeywordsSyncFailure {
  lastFailedAt: string;
  attempts: number;
}

export interface ArtKeywordsSyncState {
  keywordsByLocale: Record<string, ArtKeywordDTO[]>;
  lastSyncedAt: Record<string, string>;
  failuresByLocale: Record<string, ArtKeywordsSyncFailure>;
}
