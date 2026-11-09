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

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 30_000;
const STALE_TIME_MS = Infinity;
const GC_TIME_MS = 30 * 60_000;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

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

export const useMuseumEnrichment = (
  museumId: number | null,
  locale: string,
): UseMuseumEnrichmentResult => {
  const enabled = museumId !== null && museumId > 0;
  const effectiveMuseumId = museumId ?? 0;

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
