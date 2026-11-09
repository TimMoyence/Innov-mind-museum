import type React from 'react';
import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import { useNetInfo } from '@react-native-community/netinfo';

const CELLULAR_TYPE = 'cellular';

import {
  useDataModePreferenceStore,
  type DataModePreference,
} from '@/features/settings/dataModeStore';
import { setCurrentDataMode } from '@/shared/infrastructure/dataMode/currentDataMode';
import {
  getQualityState,
  noteNetworkIdentity,
  subscribeQualityState,
} from '@/shared/infrastructure/connectivity/networkQualityTracker';
import type { QualityState } from '@/shared/infrastructure/connectivity/networkQuality';

export type ResolvedDataMode = 'low' | 'normal';

interface NetInfoLike {
  isConnected: boolean | null;
  type: string;
  details: { isConnectionExpensive?: boolean; cellularGeneration?: string | null } | null;
}

export interface DataModeContextValue {
  preference: DataModePreference;
  resolved: ResolvedDataMode;
  isLowData: boolean;
  metered: boolean;
}

const DataModeContext = createContext<DataModeContextValue>({
  preference: 'auto',
  resolved: 'normal',
  isLowData: false,
  metered: false,
});

export function resolveDataMode(
  preference: DataModePreference,
  netInfo: NetInfoLike,
  quality: QualityState,
): ResolvedDataMode {
  if (preference === 'low') return 'low';
  if (preference === 'normal') return 'normal';

  if (netInfo.isConnected === false) return 'low';

  if (netInfo.type === CELLULAR_TYPE && netInfo.details) {
    const gen = netInfo.details.cellularGeneration;
    if (gen === '2g' || gen === '3g') {
      return 'low';
    }
  }

  if (quality === 'slow') return 'low';

  return 'normal';
}

export function deriveMetered(netInfo: {
  details: { isConnectionExpensive?: boolean } | null;
}): boolean {
  return netInfo.details?.isConnectionExpensive === true;
}

export const DataModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const preference = useDataModePreferenceStore((s) => s.preference);
  const netInfo = useNetInfo() as unknown as NetInfoLike;
  const quality = useSyncExternalStore(subscribeQualityState, getQualityState);

  const resolved = useMemo(
    () => resolveDataMode(preference, netInfo, quality),
    [preference, netInfo, quality],
  );
  const metered = useMemo(() => deriveMetered(netInfo), [netInfo]);

  useEffect(() => {
    noteNetworkIdentity({
      type: netInfo.type,
      cellularGeneration: netInfo.details?.cellularGeneration ?? null,
      isConnected: netInfo.isConnected,
    });
  }, [netInfo]);

  useEffect(() => {
    setCurrentDataMode(resolved);
  }, [resolved]);

  const value = useMemo<DataModeContextValue>(
    () => ({
      preference,
      resolved,
      isLowData: resolved === 'low',
      metered,
    }),
    [preference, resolved, metered],
  );

  return <DataModeContext.Provider value={value}>{children}</DataModeContext.Provider>;
};

export function useDataMode(): DataModeContextValue {
  return useContext(DataModeContext);
}
