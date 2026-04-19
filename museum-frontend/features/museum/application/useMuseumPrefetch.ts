import { useEffect, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';

import { useChatLocalCacheStore } from '@/features/chat/application/chatLocalCache';
import { useDataMode } from '@/features/chat/application/DataModeProvider';
import { fetchLowDataPack } from '../infrastructure/lowDataPackApi';

const PREFETCH_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours

/** In-memory cooldown tracker (resets on app restart — acceptable trade-off). */
const prefetchTimestamps = new Map<string, number>();

/**
 * Prefetches the low-data pack when a museum is selected, storing entries
 * in the local chat cache for offline / low-data serving.
 *
 * Behaviour:
 * - Skips when `museumId` is null (no museum selected).
 * - Skips when the same museum+locale was fetched within the cooldown window.
 * - Skips on non-wifi networks when low-data mode is active (avoids burning expensive data).
 * - Fail-open: fetch errors are silently swallowed (prefetch is non-critical).
 */
export function useMuseumPrefetch(museumId: string | null, locale: string): void {
  const bulkStore = useChatLocalCacheStore((s) => s.bulkStore);
  const { isLowData } = useDataMode();
  const bulkStoreRef = useRef(bulkStore);

  useEffect(() => {
    bulkStoreRef.current = bulkStore;
  }, [bulkStore]);

  useEffect(() => {
    if (!museumId) return;

    const cooldownKey = `${museumId}:${locale}`;
    const lastPrefetch = prefetchTimestamps.get(cooldownKey);
    if (lastPrefetch && Date.now() - lastPrefetch < PREFETCH_COOLDOWN_MS) return;

    void NetInfo.fetch().then((info) => {
      // Skip prefetch on non-wifi when in low-data mode (avoid burning expensive data)
      if (info.type !== 'wifi' && isLowData) return;

      void fetchLowDataPack(museumId, locale)
        .then((pack) => {
          bulkStoreRef.current(
            pack.entries.map((e) => ({
              question: e.question,
              answer: e.answer,
              metadata: e.metadata,
              museumId,
              locale,
              cachedAt: Date.now(),
              source: 'prefetch' as const,
            })),
          );
          prefetchTimestamps.set(cooldownKey, Date.now());
        })
        .catch(() => {
          // fail-open: prefetch failure is non-critical
        });
    });
  }, [museumId, locale, isLowData]);
}

/**
 * Resets the in-memory cooldown tracker. Exposed for testing only.
 * @internal
 */
export function _resetPrefetchTimestamps(): void {
  prefetchTimestamps.clear();
}
