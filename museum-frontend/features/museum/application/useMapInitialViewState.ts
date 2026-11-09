import { useEffect, useState } from 'react';

import { mapCameraCache } from '../infrastructure/mapCameraCache';
import type { MuseumWithDistance } from './useMuseumDirectory';

export interface InitialViewState {
  center: [number, number];
  zoom: number;
}

const DEFAULT_CENTER: [number, number] = [0, 20];
const DEFAULT_ZOOM = 1;
const USER_ONLY_ZOOM = 13;

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
