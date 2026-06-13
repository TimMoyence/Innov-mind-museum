/**
 * B-R2 (RED) — Registry self-test against the REAL resolver + REAL quality
 * engine (run `undefined-network-detection-reliability`, spec §10 #3, INV-17).
 *
 * Contract evolution (documented, NOT a frozen-test breach): the W1 assertion
 * "isConnectionExpensive is false on every snapshot" RATIFIED the bug class
 * (cost axis driving the quality resolution). It is superseded by INV-17:
 *
 *   (a) label-only resolution, EMPTY measurement window: each profile feeds
 *       `resolveDataMode('auto', netInfoFromProfile(p), 'unknown')` (3-arg,
 *       INV-18) and MUST resolve `p.expectedDataMode` (US-11.4 — the
 *       `expectedDataMode` semantics are now "label alone, empty window").
 *   (b) synthetic samples derived from the profile's latencyMs/lossPct replayed
 *       through the REAL engine (`addQualitySample`) MUST land on
 *       `p.expectedQuality` (skipped when null — offline has no samples).
 *   (c) `toNetInfoSnapshot(p).details.isConnectionExpensive === p.metered`
 *       (US-11.3 — derived from the data region, no more hard-coded false).
 *
 * This is the test-class that would have caught the trigger bug: `4g` carries
 * metered:true AND expectedDataMode:'normal' — (a)+(c) together prove the
 * resolver ignores the COST axis (INV-01).
 *
 * lib-docs: @react-native-community/netinfo — per-file jest.mock mirrors
 *   `__tests__/features/chat/DataModeProvider.test.tsx` (PATTERNS.md §7; the
 *   global official mock omits NetInfoCellularGeneration).
 *
 * No inline test entities: snapshots come from the registry's own helpers,
 * samples from `qualitySamplesFromProfile` (single point of truth, design §2.8).
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
  addQualitySample,
  initialQualityEngineState,
} from '@/shared/infrastructure/connectivity/networkQuality';
import {
  NETWORK_PROFILES,
  toNetInfoSnapshot,
} from '@/shared/infrastructure/connectivity/networkProfiles';
import { netInfoFromProfile } from '@/shared/testing/netInfoFromProfile';
import { qualitySamplesFromProfile } from '@/shared/testing/qualitySamplesFromProfile';

import type { QualityEngineState } from '@/shared/infrastructure/connectivity/networkQuality';
import type { NetworkProfile } from '@/shared/infrastructure/connectivity/networkProfiles';

/** Replays profile-derived samples through the REAL pure engine (INV-17 b). */
const replayThroughEngine = (profile: NetworkProfile): QualityEngineState => {
  const samples = qualitySamplesFromProfile(profile);
  return samples.reduce(
    (state, sample) => addQualitySample(state, sample),
    initialQualityEngineState(samples[0]?.atMs ?? 0),
  );
};

describe('registry self-test vs REAL resolver + REAL engine (B-R2, INV-17)', () => {
  const profiles: NetworkProfile[] = Object.values(NETWORK_PROFILES);

  it('covers the full 10-profile registry (US-11.1)', () => {
    expect(profiles).toHaveLength(10);
  });

  // ── volet (a) — label-only resolution, empty window (INV-17 a, US-11.4) ──
  it.each(profiles.map((p) => [p.name, p] as const))(
    'profile "%s" resolves to its expectedDataMode by label alone (empty window, quality=unknown)',
    (_name, profile) => {
      const snapshot = netInfoFromProfile(profile);
      expect(resolveDataMode('auto', snapshot, 'unknown')).toBe(profile.expectedDataMode);
    },
  );

  // ── volet (b) — profile-derived samples land the REAL engine on the
  //     declared verdict (INV-17 b, D-04 explicit field) ──
  it.each(profiles.filter((p) => p.expectedQuality !== null).map((p) => [p.name, p] as const))(
    'profile "%s" replayed through the REAL engine ends in its expectedQuality',
    (_name, profile) => {
      const finalState = replayThroughEngine(profile);
      expect(finalState.state).toBe(profile.expectedQuality);
    },
  );

  it('skips the engine replay ONLY for offline (expectedQuality null — no samples possible)', () => {
    const skipped = profiles.filter((p) => p.expectedQuality === null).map((p) => p.name);
    expect(skipped).toEqual(['offline']);
  });

  // ── volet (c) — isConnectionExpensive derives from profile.metered (INV-17 c, US-11.3) ──
  it.each(profiles.map((p) => [p.name, p] as const))(
    'snapshot of "%s" nests isConnectionExpensive === profile.metered under details',
    (_name, profile) => {
      const snapshot = toNetInfoSnapshot(profile);
      expect(snapshot.details).not.toBeNull();
      expect(snapshot.details?.isConnectionExpensive).toBe(profile.metered);
    },
  );

  it('honours an explicit isConnectionExpensive override on online snapshots (US-11.3)', () => {
    const fourG = NETWORK_PROFILES['4g'];
    expect(fourG.metered).toBe(true);
    const overridden = toNetInfoSnapshot(fourG, { isConnectionExpensive: false });
    expect(overridden.details?.isConnectionExpensive).toBe(false);
  });

  it('forces isConnectionExpensive false on the offline branch — no cost without an interface (US-02.5)', () => {
    // Default offline profile…
    expect(toNetInfoSnapshot(NETWORK_PROFILES.offline).details?.isConnectionExpensive).toBe(false);
    // …a metered profile in its offline window…
    const offlineWindow = toNetInfoSnapshot(NETWORK_PROFILES.flapping, { online: false });
    expect(offlineWindow.details?.isConnectionExpensive).toBe(false);
    // …and even an explicit override cannot make a dead interface expensive.
    const overridden = toNetInfoSnapshot(NETWORK_PROFILES.offline, {
      isConnectionExpensive: true,
    });
    expect(overridden.details?.isConnectionExpensive).toBe(false);
  });

  // ── the bug-class proof (INV-01) — metered cellular 4g resolves NORMAL ──
  it('4g — metered:true AND expectedDataMode normal: the cost axis no longer drives resolution (INV-01)', () => {
    const fourG = NETWORK_PROFILES['4g'];
    const snapshot = toNetInfoSnapshot(fourG);
    expect(snapshot.details?.isConnectionExpensive).toBe(true);
    expect(resolveDataMode('auto', snapshot, 'unknown')).toBe('normal');
  });

  // ── flapping in BOTH windows (3-arg resolver, unchanged verdicts) ──
  it('flapping resolves to low in its OFFLINE window (isConnected:false)', () => {
    const offlineSnapshot = toNetInfoSnapshot(NETWORK_PROFILES.flapping, { online: false });
    expect(offlineSnapshot.isConnected).toBe(false);
    expect(resolveDataMode('auto', offlineSnapshot, 'unknown')).toBe('low');
  });

  it('flapping resolves to low in its ONLINE 3g-lossy window (cellular/3g label short-circuit, D-03)', () => {
    const onlineSnapshot = toNetInfoSnapshot(NETWORK_PROFILES.flapping, { online: true });
    expect(onlineSnapshot.isConnected).toBe(true);
    expect(onlineSnapshot.type).toBe('cellular');
    expect(onlineSnapshot.details?.cellularGeneration).toBe('3g');
    expect(resolveDataMode('auto', onlineSnapshot, 'unknown')).toBe('low');
  });
});
