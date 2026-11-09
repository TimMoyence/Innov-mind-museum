import { useAppQuery } from '@/shared/data/useAppQuery';

import { museumApi } from '../infrastructure/museumApi';
import { type MuseumBranding, parseMuseumBranding } from '../domain/museum-branding';

export type UseMuseumBrandingStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface UseMuseumBrandingResult {
  branding: MuseumBranding;
  status: UseMuseumBrandingStatus;
}

const STALE_TIME_MS = Infinity;
const GC_TIME_MS = 30 * 60_000;

export const useMuseumBranding = (museumId: number | null): UseMuseumBrandingResult => {
  const enabled = museumId !== null && museumId > 0;
  const effectiveMuseumId = museumId ?? 0;

  const query = useAppQuery<MuseumBranding>({
    queryKey: ['museum-branding', effectiveMuseumId] as const,
    queryFn: async () => {
      const museum = await museumApi.getMuseum(String(effectiveMuseumId));
      return parseMuseumBranding(museum.config);
    },
    enabled,
    staleTime: STALE_TIME_MS,
    gcTime: GC_TIME_MS,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });

  let status: UseMuseumBrandingStatus;
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
    branding: query.data ?? {},
    status,
  };
};
