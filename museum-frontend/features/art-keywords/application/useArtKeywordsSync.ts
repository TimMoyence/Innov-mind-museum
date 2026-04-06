import { useCallback, useEffect, useRef } from 'react';
import { getLocale } from '@/shared/infrastructure/httpClient';
import { useConnectivity } from '@/shared/infrastructure/connectivity/useConnectivity';
import { syncKeywords } from '../infrastructure/artKeywordsApi';
import { useArtKeywordsStore } from '../infrastructure/artKeywordsStore';

const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Background sync hook for art keywords.
 * Syncs on app launch when network is available, and also when the last sync
 * for the current locale is older than 24h (or never happened).
 * Designed to be mounted once at app root level.
 */
export function useArtKeywordsSync(): void {
  const syncing = useRef(false);
  const hasRunOnLaunch = useRef(false);
  const mergeKeywords = useArtKeywordsStore((s) => s.mergeKeywords);
  const getLastSyncedAt = useArtKeywordsStore((s) => s.getLastSyncedAt);
  const { isConnected } = useConnectivity();

  const runSync = useCallback(
    async (forceLaunch: boolean) => {
      if (syncing.current) return;
      syncing.current = true;

      try {
        const locale = getLocale();
        const lastSynced = getLastSyncedAt(locale);

        const isStale =
          !lastSynced || Date.now() - new Date(lastSynced).getTime() > SYNC_INTERVAL_MS;
        if (!forceLaunch && !isStale) return;

        const response = await syncKeywords(locale, lastSynced);
        mergeKeywords(locale, response.keywords, response.syncedAt);
      } catch {
        // Silent failure — keywords are a non-critical enhancement.
        // Next app launch will retry.
      } finally {
        syncing.current = false;
      }
    },
    [mergeKeywords, getLastSyncedAt],
  );

  // Sync on launch when network is available
  useEffect(() => {
    if (!isConnected || hasRunOnLaunch.current) return;
    hasRunOnLaunch.current = true;
    void runSync(true);
  }, [isConnected, runSync]);
}
