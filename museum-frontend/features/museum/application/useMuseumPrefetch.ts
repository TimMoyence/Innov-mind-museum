import { useEffect, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';

import { useChatLocalCacheStore } from '@/features/chat/application/chatLocalCache';
import { deriveMetered, useDataMode } from '@/features/chat/application/DataModeProvider';
import { isOnline } from '@/shared/infrastructure/connectivity/isOnline';
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
 * - Skips when offline / internet unreachable (canonical `isOnline` gate).
 * - COST-axis gate (INV-02, design §2.5): skips when preference is 'low'
 *   (US-08.1), and skips on a metered connection unless the preference is an
 *   explicit 'normal' (US-02.2 / US-08.2). `metered` is derived from the FRESH
 *   `NetInfo.fetch()` snapshot (same instant as the isOnline gate), via the
 *   real `deriveMetered` — covers Android metered wifi too (US-02.6; `type`
 *   is no longer consulted). The QUALITY axis (resolved/isLowData) no longer
 *   gates the prefetch: a user on a slow-but-unmetered network keeps the pack
 *   precisely when it is most useful.
 * - Fail-open: fetch errors are silently swallowed (prefetch is non-critical).
 */
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
      // Skip prefetch unless the canonical predicate says we are online — i.e.
      // an active interface AND the internet not explicitly unreachable
      // (TD-NI-02: a captive portal on wifi has `isInternetReachable:false` and
      // must NOT trigger a fetch over dead connectivity). lib-docs:
      // @react-native-community/netinfo PATTERNS.md:173,266.
      if (
        !isOnline({ isConnected: info.isConnected, isInternetReachable: info.isInternetReachable })
      ) {
        return;
      }

      // COST-axis gate (INV-02): explicit 'low' preference always skips
      // (US-08.1); otherwise skip on a metered connection unless the user
      // explicitly asked for the full experience (US-02.2 / US-08.2).
      if (preference === 'low') return;
      // `details == null` (cold-start blank state) is non-metered by
      // definition (US-02.5) — short-circuit without invoking deriveMetered
      // so suites that mock the provider module without the helper
      // (useMuseumPrefetch.reachability.test.ts) keep their contract.
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
        .catch(() => {
          // fail-open: prefetch failure is non-critical
        });
    });
  }, [museumId, locale, preference]);
}

/**
 * Resets the in-memory cooldown tracker. Exposed for testing only.
 * @internal
 */
export function _resetPrefetchTimestamps(): void {
  prefetchTimestamps.clear();
}
