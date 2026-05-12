import NetInfo from '@react-native-community/netinfo';
import { useCallback, useEffect, useState } from 'react';

import { findCity } from '../infrastructure/cityCatalog';
import { useOfflinePackChoiceStore } from '../infrastructure/offlinePackChoiceStore';
import type { City } from '../infrastructure/cityCatalog';
import type { CityPackState } from './useOfflinePacks';
import { useOfflinePacks } from './useOfflinePacks';
import type { NearestCity } from './useNearestCity';

export interface OfflinePackPromptTrigger {
  visible: boolean;
  packState: CityPackState;
  errorVisible: boolean;
  accept: () => void;
  decline: () => void;
  retry: () => void;
  dismiss: () => void;
}

const ABSENT: CityPackState = { status: 'absent' };

/**
 * Orchestrates the offline-pack prompt: gates visibility on a strong network
 * (wifi / 4G / 5G) once a `nearestCity` is identified and the user has not
 * already decided for that city, then exposes accept / decline / retry /
 * dismiss callbacks plus the live `packState` so the modal can render a
 * progress / completion / error UI without owning the download lifecycle.
 *
 * Composes `useOfflinePacks` so the download lifecycle stays in a single
 * source of truth shared with the Settings screen. Errors thrown by the
 * download are surfaced via the local `errorVisible` flag — `useOfflinePacks`
 * reports them to Sentry but swallows them for callers, which is fine for
 * the Settings list but not for an interactive prompt.
 */
export function useOfflinePackPromptTrigger(
  nearestCity: NearestCity | null,
): OfflinePackPromptTrigger {
  const offlineChoice = useOfflinePackChoiceStore((s) =>
    nearestCity ? s.choices[nearestCity.cityId] : undefined,
  );
  const acceptOfflinePack = useOfflinePackChoiceStore((s) => s.acceptOfflinePack);
  const declineOfflinePack = useOfflinePackChoiceStore((s) => s.declineOfflinePack);
  const { packsByCity, download } = useOfflinePacks();
  const [visible, setVisible] = useState(false);
  const [errorVisible, setErrorVisible] = useState(false);

  const packState: CityPackState = nearestCity
    ? (packsByCity[nearestCity.cityId] ?? ABSENT)
    : ABSENT;

  useEffect(() => {
    if (!nearestCity) return;
    if (offlineChoice !== undefined) return;
    let cancelled = false;
    void NetInfo.fetch().then((state) => {
      if (cancelled) return;
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

  const triggerDownload = useCallback(
    (city: City) => {
      setErrorVisible(false);
      void download(city).catch(() => {
        setErrorVisible(true);
      });
    },
    [download],
  );

  const accept = useCallback(() => {
    if (!nearestCity) return;
    if (packState.status === 'active') return;
    const city = findCity(nearestCity.cityId);
    if (!city) return;
    acceptOfflinePack(nearestCity.cityId);
    triggerDownload(city);
  }, [acceptOfflinePack, nearestCity, packState.status, triggerDownload]);

  const decline = useCallback(() => {
    if (nearestCity) {
      declineOfflinePack(nearestCity.cityId);
    }
    setVisible(false);
  }, [declineOfflinePack, nearestCity]);

  const retry = useCallback(() => {
    if (!nearestCity) return;
    const city = findCity(nearestCity.cityId);
    if (!city) return;
    triggerDownload(city);
  }, [nearestCity, triggerDownload]);

  const dismiss = useCallback(() => {
    setVisible(false);
    setErrorVisible(false);
  }, []);

  return { visible, packState, errorVisible, accept, decline, retry, dismiss };
}
