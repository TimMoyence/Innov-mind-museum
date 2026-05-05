import type React from 'react';
import { createContext, useContext, useEffect, useMemo } from 'react';
import { useNetInfo } from '@react-native-community/netinfo';
import { NetInfoStateType, NetInfoCellularGeneration } from '@react-native-community/netinfo';

import {
  useDataModePreferenceStore,
  type DataModePreference,
} from '@/features/settings/dataModeStore';
import { setCurrentDataMode } from '@/shared/infrastructure/dataMode/currentDataMode';

export type ResolvedDataMode = 'low' | 'normal';

interface DataModeContextValue {
  /** User's explicit preference (auto | low | normal). */
  preference: DataModePreference;
  /** Resolved mode after evaluating network conditions. */
  resolved: ResolvedDataMode;
  /** Convenience boolean: true when resolved === 'low'. */
  isLowData: boolean;
  /** Update the user's preference. */
  setPreference: (p: DataModePreference) => void;
}

const DataModeContext = createContext<DataModeContextValue>({
  preference: 'auto',
  resolved: 'normal',
  isLowData: false,
  setPreference: () => undefined,
});

/**
 * Resolves the effective data mode from the user preference and current network state.
 *
 * Resolution rules:
 * - preference='low'    -> 'low'
 * - preference='normal' -> 'normal'
 * - preference='auto':
 *   - not connected                    -> 'low'
 *   - cellular 2G/3G                   -> 'low'
 *   - connection is expensive          -> 'low'
 *   - otherwise (wifi, 4G/5G, etc.)    -> 'normal'
 */
export function resolveDataMode(
  preference: DataModePreference,
  netInfo: {
    isConnected: boolean | null;
    type: string;
    details: { isConnectionExpensive?: boolean; cellularGeneration?: string | null } | null;
  },
): ResolvedDataMode {
  if (preference === 'low') return 'low';
  if (preference === 'normal') return 'normal';

  // Auto mode: evaluate network conditions
  if (netInfo.isConnected === false) return 'low';

  if (netInfo.type === (NetInfoStateType.cellular as string) && netInfo.details) {
    const gen = netInfo.details.cellularGeneration;
    if (
      gen === (NetInfoCellularGeneration['2g'] as string) ||
      gen === (NetInfoCellularGeneration['3g'] as string)
    ) {
      return 'low';
    }
  }

  if (netInfo.details?.isConnectionExpensive) return 'low';

  return 'normal';
}

export const DataModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const preference = useDataModePreferenceStore((s) => s.preference);
  const setPreference = useDataModePreferenceStore((s) => s.setPreference);
  const netInfo = useNetInfo();

  const resolved = useMemo(() => resolveDataMode(preference, netInfo), [preference, netInfo]);

  useEffect(() => {
    setCurrentDataMode(resolved);
  }, [resolved]);

  const value = useMemo<DataModeContextValue>(
    () => ({
      preference,
      resolved,
      isLowData: resolved === 'low',
      setPreference,
    }),
    [preference, resolved, setPreference],
  );

  return <DataModeContext.Provider value={value}>{children}</DataModeContext.Provider>;
};

/**
 * Hook to access the current data mode context.
 * Must be used within a {@link DataModeProvider}.
 */
export function useDataMode(): DataModeContextValue {
  return useContext(DataModeContext);
}
