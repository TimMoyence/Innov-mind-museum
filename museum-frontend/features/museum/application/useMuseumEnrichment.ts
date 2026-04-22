import { useCallback, useRef } from 'react';

import { useAppQuery } from '@/shared/data/useAppQuery';

import {
  museumApi,
  type MuseumEnrichmentResponse,
  type MuseumEnrichmentView,
} from '../infrastructure/museumApi';

export type UseMuseumEnrichmentStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface UseMuseumEnrichmentResult {
  data: MuseumEnrichmentView | null;
  status: UseMuseumEnrichmentStatus;
  refresh: () => void;
}

/** Polling cadence for async enrichment refreshes (matches BE job SLA). */
const POLL_INTERVAL_MS = 1500;
/** Hard cap after which we give up polling and surface whatever we cached. */
const POLL_TIMEOUT_MS = 30_000;
const STALE_TIME_MS = Infinity;
const GC_TIME_MS = 30 * 60_000;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Follows a `pending` response by polling the status endpoint at
 * {@link POLL_INTERVAL_MS} until either a `ready` response arrives or
 * {@link POLL_TIMEOUT_MS} elapses. On timeout we return `null` so the caller
 * can render a discreet "unavailable" placeholder rather than spin forever.
 */
const pollUntilReady = async (
  museumId: number,
  locale: string,
  initialJobId: string,
): Promise<MuseumEnrichmentView | null> => {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let jobId = initialJobId;

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const next: MuseumEnrichmentResponse = await museumApi.getEnrichmentStatus(
      museumId,
      locale,
      jobId,
    );
    if (next.status === 'ready') return next.data;
    jobId = next.jobId;
  }
  return null;
};

/**
 * Fetches cached enrichment for a museum. The BE returns either a `ready`
 * payload or a `pending` token — in the latter case we transparently poll the
 * status endpoint until the async refresh completes.
 *
 * Cache strategy:
 * - `staleTime: Infinity` — the server is the source of truth; we only refetch
 *   when the caller explicitly calls `refresh()` (e.g. pull-to-refresh).
 * - `gcTime: 30 min` — keep the entry for a single museum-visit session.
 * - `refetchOnMount`/`WindowFocus`/`Reconnect`: disabled (same rationale).
 *
 * Query key shape: `['museum-enrichment', museumId, locale]`. The BE caches
 * per (museumId, locale) so this matches 1:1.
 */
export const useMuseumEnrichment = (
  museumId: number | null,
  locale: string,
): UseMuseumEnrichmentResult => {
  const enabled = museumId !== null && museumId > 0;
  const effectiveMuseumId = museumId ?? 0;

  // Tracks the latest in-flight polling loop so we can abandon it on refetch.
  const pollTokenRef = useRef(0);

  const query = useAppQuery<MuseumEnrichmentView | null>({
    queryKey: ['museum-enrichment', effectiveMuseumId, locale] as const,
    queryFn: async () => {
      const initial = await museumApi.getEnrichment(effectiveMuseumId, locale);
      if (initial.status === 'ready') return initial.data;

      const myToken = ++pollTokenRef.current;
      const view = await pollUntilReady(effectiveMuseumId, locale, initial.jobId);
      if (myToken !== pollTokenRef.current) return null;
      return view;
    },
    enabled,
    staleTime: STALE_TIME_MS,
    gcTime: GC_TIME_MS,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });

  const refresh = useCallback(() => {
    // Invalidate any in-flight polling loop so the new fetch owns the result.
    pollTokenRef.current += 1;
    void query.refetch();
  }, [query]);

  let status: UseMuseumEnrichmentStatus;
  if (!enabled) {
    status = 'idle';
  } else if (query.isError) {
    status = 'error';
  } else if (query.isPending || query.isFetching) {
    status = 'loading';
  } else {
    status = 'ready';
  }

  return {
    data: query.data ?? null,
    status,
    refresh,
  };
};
