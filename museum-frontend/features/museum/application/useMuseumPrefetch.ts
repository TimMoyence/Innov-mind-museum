import { useEffect, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';

import { useChatLocalCacheStore } from '@/features/chat/application/chatLocalCache';
import { deriveMetered, useDataMode } from '@/features/chat/application/DataModeProvider';
import { isOnline } from '@/shared/infrastructure/connectivity/isOnline';
import { fetchLowDataPack } from '../infrastructure/lowDataPackApi';

const PREFETCH_COOLDOWN_MS = 6 * 60 * 60 * 1000;

const prefetchTimestamps = new Map<string, number>();

export function useMuseumPrefetch(museumId: string | null, locale: string): void {
  const bulkStore = useChatLocalCacheStore((s) => s.bulkStore);
  const { preference } = useDataMode();
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
      if (
        !isOnline({ isConnected: info.isConnected, isInternetReachable: info.isInternetReachable })
      ) {
        return;
      }

      if (preference === 'low') return;
      const details = (info.details ?? null) as { isConnectionExpensive?: boolean } | null;
      if (preference !== 'normal' && details !== null && deriveMetered({ details })) return;

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
        .catch(() => undefined);
    });
  }, [museumId, locale, preference]);
}

export function _resetPrefetchTimestamps(): void {
  prefetchTimestamps.clear();
}
