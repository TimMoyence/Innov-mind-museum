import { useCallback, useEffect, useRef, useState } from 'react';
import { getLocale } from '@/shared/infrastructure/httpClient';
import { useConnectivity } from '@/shared/infrastructure/connectivity/useConnectivity';
import { syncKeywords } from '../infrastructure/artKeywordsApi';
import { useArtKeywordsStore } from '../infrastructure/artKeywordsStore';

const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
/** Max consecutive retries before we wait for the next 24h cycle. */
const MAX_RETRY_ATTEMPTS = 3;
/** Base delay for exponential backoff between retries. */
const BACKOFF_BASE_MS = 60_000; // 1 minute

/**
 * Jitter factor applied to SYNC_INTERVAL_MS to de-synchronise cold starts
 * (prevents a thundering herd of clients refreshing at the same moment).
 * Range ±10% of the interval.
 */
const JITTER_RATIO = 0.1;

/** RNG seam for tests — default delegates to Math.random(). */
export type Random = () => number;

/** Clock seam for tests — default delegates to Date.now(). */
export type Clock = () => number;

export interface UseArtKeywordsSyncOptions {
  /** Inject a deterministic RNG for testing jitter bounds. */
  random?: Random;
  /** Inject a deterministic clock for testing staleness / skew. */
  clock?: Clock;
}

export interface UseArtKeywordsSyncResult {
  /** True when the cached keywords for the current locale are older than
   *  the 24h refresh window OR the device clock rewound past the last sync.
   *  UI can surface this to let the user know classification may be degraded. */
  isStale: boolean;
}

/**
 * Computes the effective refresh interval with ±JITTER_RATIO jitter.
 * Exported for test coverage of the jitter bounds.
 */
export function computeSyncIntervalMs(random: Random = Math.random): number {
  const jitter = (random() * 2 - 1) * JITTER_RATIO; // in [-JITTER_RATIO, +JITTER_RATIO)
  return Math.round(SYNC_INTERVAL_MS * (1 + jitter));
}

/**
 * Determines whether the stored keywords are stale and should be refreshed.
 *
 * Clock-skew-safe: if `now < lastSyncedAt` (device clock rewound — common on
 * Android reboot), the elapsed time goes negative and the naive `elapsed > MAX`
 * check would silently skip the refresh forever. We treat any negative elapsed
 * as stale.
 */
export function isKeywordCacheStale(
  lastSyncedAtIso: string | undefined,
  now: number,
  intervalMs: number = SYNC_INTERVAL_MS,
): boolean {
  if (!lastSyncedAtIso) return true;
  const lastSynced = new Date(lastSyncedAtIso).getTime();
  if (Number.isNaN(lastSynced)) return true;
  const elapsed = now - lastSynced;
  if (elapsed < 0) return true; // clock rewound → treat as stale
  return elapsed > intervalMs;
}

/**
 * Returns true when we should attempt a sync given the current failure state.
 * Caps retries at MAX_RETRY_ATTEMPTS with exponential backoff between them;
 * once the cap is hit we wait for the next natural 24h cycle.
 */
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
  if (elapsed < 0) return true; // clock rewound → allow retry
  const backoff = BACKOFF_BASE_MS * 2 ** (attempts - 1);
  return elapsed >= backoff;
}

/**
 * Background sync hook for art keywords.
 * Syncs on app launch when network is available, and also when the cached
 * keywords for the current locale are older than ~24h (with jitter) or when
 * the device clock has rewound. On failure, retries with exponential backoff
 * up to MAX_RETRY_ATTEMPTS before waiting for the next 24h cycle.
 *
 * Designed to be mounted once at app root level.
 */
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
          // Success — staleness cleared. `mergeKeywords` also wipes the
          // persisted failure counter.
          setIsStale(false);
        } catch {
          // Surface failure in the store so the next launch can back off.
          recordSyncFailure(locale, new Date(now).toISOString());
        }
      } finally {
        syncing.current = false;
      }
    },
    [mergeKeywords, getLastSyncedAt, getSyncFailure, recordSyncFailure, clock],
  );

  // Sync on launch when network is available
  useEffect(() => {
    if (!isConnected || hasRunOnLaunch.current) return;
    hasRunOnLaunch.current = true;
    void runSync(true);
  }, [isConnected, runSync]);

  return { isStale };
}
