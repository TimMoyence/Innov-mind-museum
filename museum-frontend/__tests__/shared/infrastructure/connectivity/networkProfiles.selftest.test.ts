/**
 * W1-REG-03 (RED) — Registry self-test against the REAL resolveDataMode.
 *
 * The anti-lie guard (master spec §"The Profile Registry" — Self-test invariant):
 * each profile's NetInfo snapshot is fed to the REAL `resolveDataMode('auto', snapshot)`
 * (verified at `@/features/chat/application/DataModeProvider`, anchor design.md §1:
 *   :52 preference==='low'; :56 isConnected===false; :58–63 cellular 2g/3g → 'low';
 *   isConnectionExpensive read from netInfo.details.isConnectionExpensive — nested).
 * The result MUST equal `profile.expectedDataMode`. If the resolution rule ever
 * changes, this test goes red — the registry can never silently lie.
 *
 * Snapshot shape (design.md anchor §3): `{isConnected, type, details:{
 *   isConnectionExpensive:false, cellularGeneration}}` — isConnectionExpensive
 * nested under details. The snapshot is produced by the registry's own
 * `toNetInfoSnapshot(profile, {online?})` helper (W1-REG-04) — this test FAILS
 * until that helper is exported.
 *
 * flapping is proven in BOTH windows:
 *   - OFFLINE window (online:false → isConnected:false → 'low' via :56)
 *   - ONLINE 3g-lossy window (online:true → cellular/3g → 'low' via :58–63)
 *
 * lib-docs: @react-native-community/netinfo — the per-file jest.mock below mirrors
 *   `__tests__/features/chat/DataModeProvider.test.tsx` exactly (PATTERNS.md §7;
 *   the global official mock omits NetInfoCellularGeneration so resolveDataMode
 *   would throw — file-scoped mock takes precedence, per setup-netinfo-mock.ts).
 */

// ── NetInfo mock — enums exactly as DataModeProvider.test.tsx (design.md §3) ──
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  useNetInfo: () => ({}),
  NetInfoStateType: {
    unknown: 'unknown',
    none: 'none',
    cellular: 'cellular',
    wifi: 'wifi',
    bluetooth: 'bluetooth',
    ethernet: 'ethernet',
    wimax: 'wimax',
    vpn: 'vpn',
    other: 'other',
  },
  NetInfoCellularGeneration: {
    '2g': '2g',
    '3g': '3g',
    '4g': '4g',
    '5g': '5g',
  },
  default: {
    addEventListener: jest.fn(() => jest.fn()),
    fetch: jest.fn(),
    refresh: jest.fn(),
    configure: jest.fn(),
    useNetInfo: () => ({}),
    useNetInfoInstance: jest.fn(),
  },
}));

// AsyncStorage mock (DataModeProvider transitively pulls the zustand store).
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

import { resolveDataMode } from '@/features/chat/application/DataModeProvider';
import {
  NETWORK_PROFILES,
  toNetInfoSnapshot,
} from '@/shared/infrastructure/connectivity/networkProfiles';

import type { NetworkProfile } from '@/shared/infrastructure/connectivity/networkProfiles';

describe('registry self-test vs REAL resolveDataMode (W1-REG-03)', () => {
  const profiles: NetworkProfile[] = Object.values(NETWORK_PROFILES);

  it.each(profiles.map((p) => [p.name, p] as const))(
    'profile "%s" resolves to its expectedDataMode',
    (_name, profile) => {
      const snapshot = toNetInfoSnapshot(profile);
      expect(resolveDataMode('auto', snapshot)).toBe(profile.expectedDataMode);
    },
  );

  it('proves isConnectionExpensive is nested under details on every snapshot', () => {
    for (const profile of profiles) {
      const snapshot = toNetInfoSnapshot(profile);
      expect(snapshot.details).not.toBeNull();
      expect(snapshot.details).toHaveProperty('isConnectionExpensive', false);
    }
  });

  it('flapping resolves to low in its OFFLINE window (isConnected:false → :56)', () => {
    const offlineSnapshot = toNetInfoSnapshot(NETWORK_PROFILES.flapping, { online: false });
    expect(offlineSnapshot.isConnected).toBe(false);
    expect(resolveDataMode('auto', offlineSnapshot)).toBe('low');
  });

  it('flapping resolves to low in its ONLINE 3g-lossy window (cellular/3g → :58–63)', () => {
    const onlineSnapshot = toNetInfoSnapshot(NETWORK_PROFILES.flapping, { online: true });
    expect(onlineSnapshot.isConnected).toBe(true);
    expect(onlineSnapshot.type).toBe('cellular');
    expect(onlineSnapshot.details?.cellularGeneration).toBe('3g');
    expect(resolveDataMode('auto', onlineSnapshot)).toBe('low');
  });
});
