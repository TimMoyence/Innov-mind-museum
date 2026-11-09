import { useEffect, useRef, useState } from 'react';

import { museumApi, type MuseumDetectionResult } from '@/features/museum/infrastructure/museumApi';

interface UseDetectMuseumResult {
  result: MuseumDetectionResult | null;
  isLoading: boolean;
  error: string | null;
}

export function useDetectMuseum(lat: number | null, lng: number | null): UseDetectMuseumResult {
  const [result, setResult] = useState<MuseumDetectionResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const lastFetchedTileRef = useRef<string | null>(null);

  useEffect(() => {
    const state: { cancelled: boolean } = { cancelled: false };
    const isCancelled = (): boolean => state.cancelled;

    void (async () => {
      if (lat === null || lng === null) {
        if (isCancelled()) return;
        setResult(null);
        setIsLoading(false);
        setError(null);
        return;
      }

      const tile = `${lat.toFixed(3)}:${lng.toFixed(3)}`;
      if (lastFetchedTileRef.current === tile) return;
      lastFetchedTileRef.current = tile;

      setIsLoading(true);
      try {
        const detection = await museumApi.detectMuseum({ lat, lng });
        if (isCancelled()) return;
        setResult(detection);
        setError(null);
        setIsLoading(false);
      } catch (caught) {
        if (isCancelled()) return;
        const message = caught instanceof Error ? caught.message : 'detect-museum-failed';
        setResult(null);
        setError(message);
        setIsLoading(false);
      }
    })();

    return () => {
      state.cancelled = true;
    };
  }, [lat, lng]);

  return { result, isLoading, error };
}
