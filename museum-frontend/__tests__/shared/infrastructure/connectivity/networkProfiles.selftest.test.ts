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

  it.each(profiles.map((p) => [p.name, p] as const))(
    'profile "%s" resolves to its expectedDataMode by label alone (empty window, quality=unknown)',
    (_name, profile) => {
      const snapshot = netInfoFromProfile(profile);
      expect(resolveDataMode('auto', snapshot, 'unknown')).toBe(profile.expectedDataMode);
    },
  );

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
    expect(toNetInfoSnapshot(NETWORK_PROFILES.offline).details?.isConnectionExpensive).toBe(false);
    const offlineWindow = toNetInfoSnapshot(NETWORK_PROFILES.flapping, { online: false });
    expect(offlineWindow.details?.isConnectionExpensive).toBe(false);
    const overridden = toNetInfoSnapshot(NETWORK_PROFILES.offline, {
      isConnectionExpensive: true,
    });
    expect(overridden.details?.isConnectionExpensive).toBe(false);
  });

  it('4g — metered:true AND expectedDataMode normal: the cost axis no longer drives resolution (INV-01)', () => {
    const fourG = NETWORK_PROFILES['4g'];
    const snapshot = toNetInfoSnapshot(fourG);
    expect(snapshot.details?.isConnectionExpensive).toBe(true);
    expect(resolveDataMode('auto', snapshot, 'unknown')).toBe('normal');
  });

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
