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
