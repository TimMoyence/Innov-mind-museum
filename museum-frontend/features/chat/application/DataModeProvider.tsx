import type React from 'react';
import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import { useNetInfo } from '@react-native-community/netinfo';

/**
 * NetInfo's `type` value for a cellular interface. Compared as a string literal
 * (NetInfo emits `'cellular'`) rather than via the `NetInfoStateType` runtime
 * enum object, which is `undefined` under the official Jest mock and is not
 * needed at runtime. Same rationale for the `'2g'`/`'3g'` generation literals
 * below (the `NetInfoCellularGeneration` enum values ARE those strings).
 */
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

/** Structural NetInfo subset the pure helpers consume (INV-18 — no global read). */
interface NetInfoLike {
  isConnected: boolean | null;
  type: string;
  details: { isConnectionExpensive?: boolean; cellularGeneration?: string | null } | null;
}

export interface DataModeContextValue {
  /** User's explicit preference (auto | low | normal). */
  preference: DataModePreference;
  /** Resolved mode after evaluating availability + quality + preference. */
  resolved: ResolvedDataMode;
  /** Convenience boolean: true when resolved === 'low'. */
  isLowData: boolean;
  /**
   * COST axis (`isConnectionExpensive`, metered network). Drives only
   * volume decisions (prefetch, upload compression) — NEVER the resolution
   * in auto, never TTS/header/badge (INV-01/INV-02).
   */
  metered: boolean;
  /** Update the user's preference. */
  setPreference: (p: DataModePreference) => void;
}

const DataModeContext = createContext<DataModeContextValue>({
  preference: 'auto',
  resolved: 'normal',
  isLowData: false,
  metered: false,
  setPreference: () => undefined,
});

/**
 * Resolves the effective data mode from the user preference, the current
 * network state and the measured quality state (3rd argument is MANDATORY —
 * INV-18: quality is passed as an input, never read from a global here).
 *
 * Resolution rules (exact order, INV-03/04/05/11 — design §2.4):
 * - preference='low'    -> 'low'   (explicit preferences beat everything)
 * - preference='normal' -> 'normal'
 * - preference='auto':
 *   - not connected                    -> 'low'  (D-02)
 *   - cellular 2G/3G                   -> 'low'  (label short-circuit, D-03)
 *   - quality === 'slow'               -> 'low'  (measured QUALITY axis)
 *   - otherwise                        -> 'normal' ('unknown' ≡ 'ok', US-04.4)
 *
 * `isConnectionExpensive` NEVER participates (INV-01) — it is the COST axis,
 * exposed separately via {@link deriveMetered}. The former `expensive ⇒ low`
 * rule punished every healthy cellular user (iOS marks ALL cellular expensive).
 */
export function resolveDataMode(
  preference: DataModePreference,
  netInfo: NetInfoLike,
  quality: QualityState,
): ResolvedDataMode {
  if (preference === 'low') return 'low';
  if (preference === 'normal') return 'normal';

  // Auto mode: availability, then label, then measured quality
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

/**
 * COST-axis signal (INV-02): `true` iff `details.isConnectionExpensive === true`.
 * `details` null/absent (cold-start, iOS blank state) ⇒ `false` (US-02.5).
 */
export function deriveMetered(netInfo: {
  details: { isConnectionExpensive?: boolean } | null;
}): boolean {
  return netInfo.details?.isConnectionExpensive === true;
}

export const DataModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const preference = useDataModePreferenceStore((s) => s.preference);
  const setPreference = useDataModePreferenceStore((s) => s.setPreference);
  const netInfo = useNetInfo() as unknown as NetInfoLike;
  // External-store subscription (React 19 canonical shape — lib-docs react
  // PATTERNS.md:106): stable snapshot, notified on transitions only (NFR-02).
  const quality = useSyncExternalStore(subscribeQualityState, getQualityState);

  const resolved = useMemo(
    () => resolveDataMode(preference, netInfo, quality),
    [preference, netInfo, quality],
  );
  const metered = useMemo(() => deriveMetered(netInfo), [netInfo]);

  // Feeds the identity tuple to the tracker so a network change resets the
  // measurement window (US-04.3 wiring — design §2.4).
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
      setPreference,
    }),
    [preference, resolved, metered, setPreference],
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
