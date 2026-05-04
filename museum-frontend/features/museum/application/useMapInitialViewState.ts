import { useEffect, useState } from 'react';

import { mapCameraCache } from '../infrastructure/mapCameraCache';
import type { MuseumWithDistance } from './useMuseumDirectory';

export interface InitialViewState {
  center: [number, number];
  zoom: number;
}

// Fallback world-centered view used only when the map loads with no user
// location AND no cached camera. Any actual data — cached GPS from a previous
// session or the fresh GPS fix — takes precedence.
const DEFAULT_CENTER: [number, number] = [0, 20];
const DEFAULT_ZOOM = 1;
const USER_ONLY_ZOOM = 13;

/**
 * Resolves the starting camera view exactly once per mount: cached camera →
 * GPS-when-present → world-default. After the first resolution, later GPS
 * arrivals are NOT re-seeded (data-driven fit handles them).
 *
 * Returns `null` while the AsyncStorage `mapCameraCache.load()` is in flight,
 * so callers can hold the Map mount until the starting view resolves and
 * avoid a flicker where the camera renders with defaults then jumps.
 *
 * NOTE: this hook is intentionally a one-shot. Re-renders with new
 * `userLatitude` / `userLongitude` after resolution are ignored.
 *
 * `_museums` is accepted in the signature for forward-compat (a future
 * iteration may seed the camera on the cluster centroid when GPS is
 * unavailable but museum data is present). Currently unused.
 */
export function useMapInitialViewState(
  _museums: readonly MuseumWithDistance[],
  userLatitude: number | null,
  userLongitude: number | null,
): InitialViewState | null {
  const [state, setState] = useState<InitialViewState | null>(null);
  const hasResolved = state !== null;

  useEffect(() => {
    if (hasResolved) return;
    let cancelled = false;
    void mapCameraCache
      .load()
      .then((cam) => {
        if (cancelled) return;
        if (cam) {
          setState({ center: [cam.centerLng, cam.centerLat], zoom: cam.zoom });
          return;
        }
        if (userLatitude !== null && userLongitude !== null) {
          setState({ center: [userLongitude, userLatitude], zoom: USER_ONLY_ZOOM });
          return;
        }
        setState({ center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM });
      })
      .catch(() => {
        // AsyncStorage rejection is non-fatal — fall back to GPS-or-default
        // so the Map can still mount. Mirrors the cache's own internal
        // null-on-error contract.
        if (cancelled) return;
        if (userLatitude !== null && userLongitude !== null) {
          setState({ center: [userLongitude, userLatitude], zoom: USER_ONLY_ZOOM });
          return;
        }
        setState({ center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM });
      });
    return () => {
      cancelled = true;
    };
  }, [hasResolved, userLatitude, userLongitude]);

  return state;
}
