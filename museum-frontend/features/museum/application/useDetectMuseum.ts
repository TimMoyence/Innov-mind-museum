/**
 * W3 Cluster B — `useDetectMuseum(lat, lng)` hook.
 *
 * Thin wrapper around `museumApi.detectMuseum` that:
 *   - De-duplicates fetches per (lat, lng) tile rounded to 3 decimals
 *     (~111 m). Small GPS jitter does not hammer the BE.
 *   - Returns `{ result, isLoading, error }` — `result` is `null` until the
 *     first fetch resolves AND when GPS is unavailable.
 *   - Tolerates fetch failure silently (returns `error` but never throws).
 *     Callers fall back to the picker per spec R14.
 *
 * Spec : `team-state/2026-05-17-w3-geo-walk-intra/spec.md` R11-R14.
 */

import { useEffect, useRef, useState } from 'react';

import { museumApi, type MuseumDetectionResult } from '@/features/museum/infrastructure/museumApi';

interface UseDetectMuseumResult {
  /** Detection payload from BE, or `null` until first fetch resolves / on missing coords. */
  result: MuseumDetectionResult | null;
  /** True until the first fetch resolves. Flips false on error/abort too. */
  isLoading: boolean;
  /** Last fetch error (truncated to message). `null` until first failure. */
  error: string | null;
}

/**
 * Detects the museum the visitor is in/near for the given coordinates.
 *
 * Pass `null` for `lat` / `lng` (e.g. GPS not granted yet) to skip the fetch
 * — the hook resolves `{ result: null, isLoading: false, error: null }`.
 */
export function useDetectMuseum(lat: number | null, lng: number | null): UseDetectMuseumResult {
  const [result, setResult] = useState<MuseumDetectionResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  // De-dup tile across renders so a re-render with the same coords does NOT
  // re-trigger the effect's fetch.
  const lastFetchedTileRef = useRef<string | null>(null);

  useEffect(() => {
    // Cancellation cell — accessed via a closure cell + getter so eslint-flow
    // narrowing cannot prove the post-await read is always-false (pattern from
    // `useProactiveMuseumSuggestion`).
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

      // De-dup fetches per ~111 m tile.
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
