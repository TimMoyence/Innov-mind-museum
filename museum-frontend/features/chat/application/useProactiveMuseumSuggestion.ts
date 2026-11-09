import { useCallback, useEffect, useRef, useState } from 'react';

import { useLocation } from '@/features/museum/application/useLocation';
import { dismissBanner, isBannerDismissed } from '@/features/chat/application/bannerDismissal';
import { museumApi } from '@/features/museum/infrastructure/museumApi';

export const PROACTIVE_MUSEUM_BANNER_DISMISS_STORAGE_KEY =
  'settings.proactive_museum_banner_dismissed_until';

export const PROACTIVE_MUSEUM_BANNER_DISMISS_DURATION_MS = 4 * 60 * 60 * 1000;

export const PROACTIVE_MUSEUM_MIN_CONFIDENCE = 0.5;

export interface ProactiveMuseum {
  readonly id: number;
  readonly name: string;
  readonly confidence: number;
  readonly latitude: number;
  readonly longitude: number;
  readonly distanceMeters: number | null;
}

function bucketConfidence(c: number): 'high' | 'medium' | 'low' {
  if (c > 0.8) return 'high';
  if (c > 0.5) return 'medium';
  return 'low';
}

export function useProactiveMuseumSuggestion(): {
  museum: ProactiveMuseum | null;
  isLoading: boolean;
  dismiss: () => Promise<void>;
} {
  const { latitude, longitude, status } = useLocation();
  const [museum, setMuseum] = useState<ProactiveMuseum | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const lastFetchedTileRef = useRef<string | null>(null);

  useEffect(() => {
    const state: { cancelled: boolean } = { cancelled: false };
    const isCancelled = (): boolean => state.cancelled;

    void (async () => {
      if (status !== 'granted' || latitude === null || longitude === null) {
        if (isCancelled()) return;
        setMuseum(null);
        setIsLoading(false);
        return;
      }

      const tile = `${latitude.toFixed(3)}:${longitude.toFixed(3)}`;
      if (lastFetchedTileRef.current === tile) return;
      lastFetchedTileRef.current = tile;

      try {
        const dismissed = await isBannerDismissed(PROACTIVE_MUSEUM_BANNER_DISMISS_STORAGE_KEY);
        if (isCancelled()) return;
        if (dismissed) {
          setMuseum(null);
          setIsLoading(false);
          return;
        }

        const detection = await museumApi.detectMuseum({
          lat: latitude,
          lng: longitude,
        });
        if (isCancelled()) return;

        if (
          detection.museumId === null ||
          detection.museumId <= 0 ||
          detection.confidence <= PROACTIVE_MUSEUM_MIN_CONFIDENCE ||
          detection.name === null
        ) {
          setMuseum(null);
          setIsLoading(false);
          return;
        }

        const next: ProactiveMuseum = {
          id: detection.museumId,
          name: detection.name,
          confidence: detection.confidence,
          latitude,
          longitude,
          distanceMeters: detection.distance,
        };
        setMuseum(next);
        setIsLoading(false);

        console.debug('[B6] proactive_museum_shown', {
          confidence_bucket: bucketConfidence(detection.confidence),
        });
      } catch {
        if (isCancelled()) return;
        setMuseum(null);
        setIsLoading(false);
        console.debug('[B6] proactive_museum_fetch_failed', { reason: 'fetch-error' });
      }
    })();

    return () => {
      state.cancelled = true;
    };
  }, [latitude, longitude, status]);

  const dismiss = useCallback(async (): Promise<void> => {
    setMuseum(null);
    await dismissBanner(
      PROACTIVE_MUSEUM_BANNER_DISMISS_STORAGE_KEY,
      PROACTIVE_MUSEUM_BANNER_DISMISS_DURATION_MS,
    );
  }, []);

  return { museum, isLoading, dismiss };
}
