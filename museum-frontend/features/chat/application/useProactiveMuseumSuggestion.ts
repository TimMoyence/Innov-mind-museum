/**
 * B6 / W3 — Proactive in-museum suggestion banner data layer (refactored).
 *
 * Previous flow (B6) fetched `museumApi.searchMuseums` + manual `<200m` filter
 * + OSM-id-positive filter. W3 (2026-05-17) replaces that with
 * `museumApi.detectMuseum` which returns a typed `MuseumDetectionResult`
 * with a deterministic `confidence` value (geofence-hit ⇒ 1.0; haversine
 * decay otherwise). The dismiss-storage gate, GPS gate, and tile de-dup
 * behaviour are PRESERVED — UFR-016: reuse not duplicate.
 *
 * Confidence-driven UI is now the caller's responsibility (see
 * `<ProactiveMuseumBanner>`):
 *   - `confidence > 0.8`  → auto-pickup banner.
 *   - `confidence ∈ (0.5, 0.8]` → confirm bottom-sheet ("Tu sembles proche du …").
 *   - `confidence ≤ 0.5` → no proactive UI; manual picker is the fallback.
 *
 * Spec : `team-state/2026-05-17-w3-geo-walk-intra/spec.md` R11-R14, R18.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { useLocation } from '@/features/museum/application/useLocation';
import { museumApi } from '@/features/museum/infrastructure/museumApi';
import { storage } from '@/shared/infrastructure/storage';

/** Storage key holding the ISO timestamp until which the banner stays hidden. */
export const PROACTIVE_MUSEUM_BANNER_DISMISS_STORAGE_KEY =
  'settings.proactive_museum_banner_dismissed_until';

/** 4 hours in milliseconds — duration of the dismiss-until window. */
export const PROACTIVE_MUSEUM_BANNER_DISMISS_DURATION_MS = 4 * 60 * 60 * 1000;

/**
 * Lower bound for surfacing any proactive UI. Below this, the hook returns
 * `museum: null` — visitor is too far from a known museum to be relevant.
 * Equivalent to the previous "in-museum 200 m" threshold under the new
 * confidence model (`confidence = 1 - distance/500` ⇒ `distance ≤ 250m` ⇒
 * `confidence ≥ 0.5`).
 */
export const PROACTIVE_MUSEUM_MIN_CONFIDENCE = 0.5;

/**
 * Suggestion payload exposed to the banner — extended with `confidence` so
 * the banner can pick between auto-pickup vs confirm-sheet UI. `latitude`
 * and `longitude` mirror the device GPS fix at detection time (kept for
 * downstream consumers wiring `useStartConversation({ coordinates })`).
 */
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

/**
 * Proactive in-museum suggestion data hook.
 *
 * - Reads GPS via {@link useLocation} (no permission prompt — inherits Museums
 *   tab's prior consent).
 * - Calls `museumApi.detectMuseum({ lat, lng })` exactly once per (lat,lng)
 *   tile rounded to 3 decimals (~111 m).
 * - Returns the detection ONLY when `museumId > 0` AND
 *   `confidence > PROACTIVE_MUSEUM_MIN_CONFIDENCE` (0.5).
 * - Respects the same dismiss-until storage flag as before.
 * - Tolerates API and storage failures silently — never throws.
 */
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
        // 1. Dismiss-until storage gate (tolerant of failure).
        let dismissedUntilRaw: string | null = null;
        try {
          dismissedUntilRaw = await storage.getItem(PROACTIVE_MUSEUM_BANNER_DISMISS_STORAGE_KEY);
        } catch {
          // Storage read failed → treat as "not dismissed".
        }
        if (isCancelled()) return;
        if (dismissedUntilRaw !== null && dismissedUntilRaw.length > 0) {
          const dismissedUntilMs = new Date(dismissedUntilRaw).getTime();
          if (!Number.isNaN(dismissedUntilMs) && Date.now() < dismissedUntilMs) {
            setMuseum(null);
            setIsLoading(false);
            return;
          }
        }

        // 2. Fetch detect-museum (BE-side confidence model).
        const detection = await museumApi.detectMuseum({
          lat: latitude,
          lng: longitude,
        });
        if (isCancelled()) return;

        // 3. Eligibility — id present AND confidence above min threshold.
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

        // 4. Telemetry — confidence bucket only (no PII).
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
    const until = new Date(Date.now() + PROACTIVE_MUSEUM_BANNER_DISMISS_DURATION_MS).toISOString();
    try {
      await storage.setItem(PROACTIVE_MUSEUM_BANNER_DISMISS_STORAGE_KEY, until);
    } catch {
      // Storage write failure tolerated — banner already hidden locally.
    }
  }, []);

  return { museum, isLoading, dismiss };
}
