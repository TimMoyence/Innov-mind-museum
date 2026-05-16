/**
 * B6 — Proactive in-museum suggestion banner data layer.
 *
 * Inherits GPS permission from {@link useLocation} (already requested by the
 * Museums tab — no auto-prompt on the home screen). When coords are available,
 * calls `museumApi.searchMuseums({ lat, lng, radius: 1000 })` exactly once per
 * (lat,lng) tile (~111 m) and picks the closest entry with `id > 0` AND
 * `distance < 200 m`. A dismiss-until storage flag suppresses the banner for
 * 4 hours after the user taps the dismiss button.
 *
 * Spec : `docs/chat-ux-refonte/specs/B6.md` §1.1 R1-R14 ; §4 AC1-AC13.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { useLocation } from '@/features/museum/application/useLocation';
import { museumApi } from '@/features/museum/infrastructure/museumApi';
import { storage } from '@/shared/infrastructure/storage';

/** Storage key holding the ISO timestamp until which the banner stays hidden. */
export const PROACTIVE_MUSEUM_BANNER_DISMISS_STORAGE_KEY =
  'settings.proactive_museum_banner_dismissed_until';

/** 4 hours in milliseconds — duration of the dismiss-until window (shorter than B2's 24h: in-museum context is volatile). */
export const PROACTIVE_MUSEUM_BANNER_DISMISS_DURATION_MS = 4 * 60 * 60 * 1000;

/** In-museum proximity threshold in meters, aligned with backend `LocationResolver.IN_MUSEUM_THRESHOLD_M`. */
export const PROACTIVE_MUSEUM_IN_MUSEUM_THRESHOLD_M = 200;

/** Minimum radius accepted by `searchMuseumsQuerySchema.radius` (BE schema floor — the actual in-museum threshold is applied client-side). */
const SEARCH_RADIUS_M = 1000;

/**
 * Shape returned by {@link useProactiveMuseumSuggestion} when an eligible
 * in-museum match is found. Narrowed from `MuseumSearchEntry` to fields the
 * banner needs.
 */
export interface ProactiveMuseum {
  readonly id: number;
  readonly name: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly distanceMeters: number;
}

/**
 * Internal narrow type for fields we consume from `museumApi.searchMuseums`.
 * The OpenAPI-generated entry types `id`/`latitude`/`longitude`/`distance` as
 * `number | null | undefined` (OSM-only entries lack a local id) — we explicitly
 * guard each field before building a `ProactiveMuseum`.
 */
interface SearchMuseumEntryLike {
  readonly id?: number | null;
  readonly name?: string | null;
  readonly latitude?: number | null;
  readonly longitude?: number | null;
  readonly distance?: number | null;
}

/**
 * Shape guaranteed by {@link isEligibleEntry} — all fields narrowed to their
 * non-nullable forms so the call site can build a `ProactiveMuseum` without
 * non-null assertions.
 */
interface EligibleSearchMuseumEntry extends SearchMuseumEntryLike {
  readonly id: number;
  readonly name: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly distance: number;
}

/**
 * Type guard verifying that every field used by {@link ProactiveMuseum} is
 * present (non-null, non-undefined) AND that the entry is eligible for the
 * in-museum banner (numeric local id > 0, distance under threshold).
 */
function isEligibleEntry(m: SearchMuseumEntryLike): m is EligibleSearchMuseumEntry {
  return (
    typeof m.id === 'number' &&
    m.id > 0 &&
    typeof m.distance === 'number' &&
    m.distance < PROACTIVE_MUSEUM_IN_MUSEUM_THRESHOLD_M &&
    typeof m.latitude === 'number' &&
    typeof m.longitude === 'number' &&
    typeof m.name === 'string'
  );
}

function bucketDistance(d: number): '0-50' | '50-100' | '100-150' | '150-200' {
  if (d < 50) return '0-50';
  if (d < 100) return '50-100';
  if (d < 150) return '100-150';
  return '150-200';
}

/**
 * Proactive in-museum suggestion banner data hook.
 *
 * - Reads GPS via {@link useLocation} (no permission prompt — inherits Museums
 *   tab's prior consent).
 * - Calls `museumApi.searchMuseums({ lat, lng, radius: 1000 })` exactly once
 *   per (lat,lng) tile rounded to 3 decimals (~111 m).
 * - Picks the first entry with `id > 0` AND `distance < 200 m` (filters out
 *   OSM-only entries which lack a local id).
 * - Respects a dismiss-until storage flag (`settings.proactive_museum_banner_dismissed_until`)
 *   suppressing the banner for 4 h after the user taps dismiss.
 * - Tolerates API and storage failures silently — never throws.
 *
 * @returns `{ museum, isLoading, dismiss }` — `museum` is `null` until the
 * first fetch resolves and stays `null` if no eligible match is found.
 */
export function useProactiveMuseumSuggestion(): {
  museum: ProactiveMuseum | null;
  isLoading: boolean;
  dismiss: () => Promise<void>;
} {
  const { latitude, longitude, status } = useLocation();
  const [museum, setMuseum] = useState<ProactiveMuseum | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  // De-dup fetches across renders within the same ~111 m tile. Held as ref so
  // a re-render with the same coords does NOT re-trigger the effect's fetch.
  const lastFetchedTileRef = useRef<string | null>(null);

  useEffect(() => {
    // Cancellation flag flipped by the effect cleanup — read across the await
    // boundaries below to avoid setting state on an unmounted component.
    // Wrapped in a single-cell record + an accessor so typescript-eslint's
    // flow analysis cannot narrow the `false` literal initialiser and flag
    // post-await reads as "always falsy" (the cleanup writes via the same
    // reference; the accessor opaques the read).
    const state: { cancelled: boolean } = { cancelled: false };
    const isCancelled = (): boolean => state.cancelled;

    void (async () => {
      // GPS gate (R2-R3, AC2-AC3). Wrapped in the async IIFE so the
      // synchronous-setState-in-effect lint rule fires once at the boundary,
      // not on the cancellation-guarded early return paths below.
      if (status !== 'granted' || latitude === null || longitude === null) {
        if (isCancelled()) return;
        setMuseum(null);
        setIsLoading(false);
        return;
      }

      // De-dup fetches across renders within the same ~111 m tile.
      const tile = `${latitude.toFixed(3)}:${longitude.toFixed(3)}`;
      if (lastFetchedTileRef.current === tile) return;
      lastFetchedTileRef.current = tile;

      try {
        // 1. Dismiss-until storage gate — read tolerant of failure (R8, AC13).
        let dismissedUntilRaw: string | null = null;
        try {
          dismissedUntilRaw = await storage.getItem(PROACTIVE_MUSEUM_BANNER_DISMISS_STORAGE_KEY);
        } catch {
          // Storage read failed → treat as "not dismissed" (R8).
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

        // 2. Fetch search results (BE pre-sorts asc by distance).
        const response = await museumApi.searchMuseums({
          lat: latitude,
          lng: longitude,
          radius: SEARCH_RADIUS_M,
        });
        if (isCancelled()) return;

        // 3. Pick the first entry with id > 0 AND distance < 200 m AND coords present.
        //    OSM-only entries (id <= 0) are filtered out (R14, AC6) — the banner
        //    needs a numeric museumId for `useStartConversation`.
        const eligible = (response.museums as readonly SearchMuseumEntryLike[]).find(
          isEligibleEntry,
        );

        if (!eligible) {
          setMuseum(null);
          setIsLoading(false);
          return;
        }

        // Type guard `isEligibleEntry` narrowed every field above — no assertions needed.
        const next: ProactiveMuseum = {
          id: eligible.id,
          name: eligible.name,
          latitude: eligible.latitude,
          longitude: eligible.longitude,
          distanceMeters: eligible.distance,
        };
        setMuseum(next);
        setIsLoading(false);

        // 4. Telemetry — distance bucket only (NFR4). No PII: no museum id /
        //    name, no exact distance, no coords.
        console.debug('[B6] proactive_museum_shown', {
          distance_bucket: bucketDistance(next.distanceMeters),
        });
      } catch {
        if (isCancelled()) return;
        // API failure → silent fall-through (R12, AC12). Banner stays null.
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
    // Optimistic UI : clear local state synchronously, then persist (R9, AC11).
    setMuseum(null);
    const until = new Date(Date.now() + PROACTIVE_MUSEUM_BANNER_DISMISS_DURATION_MS).toISOString();
    try {
      await storage.setItem(PROACTIVE_MUSEUM_BANNER_DISMISS_STORAGE_KEY, until);
    } catch {
      // Storage write failure tolerated — banner already hidden locally for
      // this mount. Next launch will re-fetch and possibly re-show the banner.
    }
  }, []);

  return { museum, isLoading, dismiss };
}
