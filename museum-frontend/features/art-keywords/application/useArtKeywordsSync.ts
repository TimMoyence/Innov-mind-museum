import { useCallback, useEffect, useRef, useState } from 'react';
import { useConnectivity } from '@/shared/infrastructure/connectivity/useConnectivity';
import { syncKeywords, getLocale } from '../infrastructure/artKeywordsApi';
import { useArtKeywordsStore } from '../infrastructure/artKeywordsStore';

const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;
const MAX_RETRY_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 60_000;

const JITTER_RATIO = 0.1;

export type Random = () => number;

export type Clock = () => number;

export interface UseArtKeywordsSyncOptions {
  random?: Random;
  clock?: Clock;
}

export interface UseArtKeywordsSyncResult {
  isStale: boolean;
}

export function computeSyncIntervalMs(random: Random = Math.random): number {
  const jitter = (random() * 2 - 1) * JITTER_RATIO;
  return Math.round(SYNC_INTERVAL_MS * (1 + jitter));
}

export function isKeywordCacheStale(
  lastSyncedAtIso: string | undefined,
  now: number,
  intervalMs: number = SYNC_INTERVAL_MS,
): boolean {
  if (!lastSyncedAtIso) return true;
  const lastSynced = new Date(lastSyncedAtIso).getTime();
  if (Number.isNaN(lastSynced)) return true;
  const elapsed = now - lastSynced;
  if (elapsed < 0) return true;
  return elapsed > intervalMs;
}

export function canRetryAfterFailure(
  attempts: number | undefined,
  lastFailedAtIso: string | undefined,
  now: number,
): boolean {
  if (!attempts || !lastFailedAtIso) return true;
  if (attempts >= MAX_RETRY_ATTEMPTS) return false;
  const lastFailed = new Date(lastFailedAtIso).getTime();
  if (Number.isNaN(lastFailed)) return true;
  const elapsed = now - lastFailed;
  if (elapsed < 0) return true;
  const backoff = BACKOFF_BASE_MS * 2 ** (attempts - 1);
  return elapsed >= backoff;
}

export function useArtKeywordsSync(
  options: UseArtKeywordsSyncOptions = {},
): UseArtKeywordsSyncResult {
  const { random = Math.random, clock = Date.now } = options;

  const syncing = useRef(false);
  const hasRunOnLaunch = useRef(false);
  const intervalRef = useRef<number>(computeSyncIntervalMs(random));

  const mergeKeywords = useArtKeywordsStore((s) => s.mergeKeywords);
  const getLastSyncedAt = useArtKeywordsStore((s) => s.getLastSyncedAt);
  const recordSyncFailure = useArtKeywordsStore((s) => s.recordSyncFailure);
  const getSyncFailure = useArtKeywordsStore((s) => s.getSyncFailure);
  const { isConnected } = useConnectivity();

  const [isStale, setIsStale] = useState<boolean>(() =>
    isKeywordCacheStale(getLastSyncedAt(getLocale()), clock(), intervalRef.current),
  );

  const runSync = useCallback(
    async (forceLaunch: boolean) => {
      if (syncing.current) return;
      syncing.current = true;

      try {
        const locale = getLocale();
        const lastSynced = getLastSyncedAt(locale);
        const now = clock();
        const stale = isKeywordCacheStale(lastSynced, now, intervalRef.current);
        setIsStale(stale);

        if (!forceLaunch && !stale) return;

        const failure = getSyncFailure(locale);
        if (!canRetryAfterFailure(failure?.attempts, failure?.lastFailedAt, now)) {
          return;
        }

        try {
          const response = await syncKeywords(locale, lastSynced);
          mergeKeywords(locale, response.keywords, response.syncedAt);
          setIsStale(false);
        } catch {
          recordSyncFailure(locale, new Date(now).toISOString());
        }
      } finally {
        syncing.current = false;
      }
    },
    [mergeKeywords, getLastSyncedAt, getSyncFailure, recordSyncFailure, clock],
  );

  useEffect(() => {
    if (!isConnected || hasRunOnLaunch.current) return;
    hasRunOnLaunch.current = true;
    void runSync(true);
  }, [isConnected, runSync]);

  return { isStale };
}
