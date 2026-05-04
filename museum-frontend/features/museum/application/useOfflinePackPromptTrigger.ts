import NetInfo from '@react-native-community/netinfo';
import { useCallback, useEffect, useState } from 'react';

import { useOfflinePackChoiceStore } from '../infrastructure/offlinePackChoiceStore';
import type { NearestCity } from './useNearestCity';

export interface OfflinePackPromptTrigger {
  visible: boolean;
  accept: () => void;
  decline: () => void;
}

/**
 * Orchestrates the offline-pack prompt: asks NetInfo whether the device is on
 * a strong network (wifi or 4G/5G) once a `nearestCity` is identified and the
 * user has not already accepted or declined for that city, then exposes the
 * accept / decline callbacks for the prompt UI.
 *
 * Pulls `offlineChoice`, `acceptOfflinePack`, `declineOfflinePack` directly
 * from `useOfflinePackChoiceStore` so the caller only has to pass the
 * derived `nearestCity`.
 *
 * Mirrors the inline NetInfo + zustand wiring previously living in
 * `MuseumMapView.tsx` — extracted to keep the component shell under 300 LOC
 * and to bring component-level `useEffect` count to ≤ 2.
 */
export function useOfflinePackPromptTrigger(
  nearestCity: NearestCity | null,
): OfflinePackPromptTrigger {
  const offlineChoice = useOfflinePackChoiceStore((s) =>
    nearestCity ? s.choices[nearestCity.cityId] : undefined,
  );
  const acceptOfflinePack = useOfflinePackChoiceStore((s) => s.acceptOfflinePack);
  const declineOfflinePack = useOfflinePackChoiceStore((s) => s.declineOfflinePack);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!nearestCity) return;
    if (offlineChoice !== undefined) return; // user already decided for this city
    let cancelled = false;
    void NetInfo.fetch().then((state) => {
      if (cancelled) return;
      // NetInfo `type` and `cellularGeneration` are string enums at runtime
      // but TypeScript models them as opaque enum members. Narrowing through
      // `unknown` lets us compare against the runtime-equivalent strings
      // without tripping `no-unsafe-enum-comparison`, and the explicit
      // optional-shape cast on `details` removes the nullability assumption
      // that triggers `no-unnecessary-condition`.
      const type: unknown = state.type;
      const details = (state as { details?: { cellularGeneration?: unknown } | null }).details;
      const gen: unknown = details?.cellularGeneration;
      const isStrong = type === 'wifi' || (type === 'cellular' && (gen === '4g' || gen === '5g'));
      if (isStrong) setVisible(true);
    });
    return () => {
      cancelled = true;
    };
  }, [nearestCity, offlineChoice]);

  const accept = useCallback(() => {
    if (nearestCity) {
      acceptOfflinePack(nearestCity.cityId);
    }
    setVisible(false);
  }, [acceptOfflinePack, nearestCity]);

  const decline = useCallback(() => {
    if (nearestCity) {
      declineOfflinePack(nearestCity.cityId);
    }
    setVisible(false);
  }, [declineOfflinePack, nearestCity]);

  return { visible, accept, decline };
}
