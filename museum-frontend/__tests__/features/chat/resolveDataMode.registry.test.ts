import { resolveDataMode } from '@/features/chat/application/DataModeProvider';
import { NETWORK_PROFILES } from '@/shared/infrastructure/connectivity/networkProfiles';
import { netInfoFromProfile } from '@/shared/testing/netInfoFromProfile';

describe('M1 — resolveDataMode over the 10-profile registry (B-R2)', () => {
  it('runs the matrix over all 10 ratified profiles (US-11.1)', () => {
    expect(Object.values(NETWORK_PROFILES)).toHaveLength(10);
  });

  it.each(Object.values(NETWORK_PROFILES))(
    "auto + $name profile (empty window) resolves to its expectedDataMode '$expectedDataMode' (US-11.4)",
    (profile) => {
      const snapshot = netInfoFromProfile(profile);

      expect(resolveDataMode('auto', snapshot, 'unknown')).toBe(profile.expectedDataMode);
    },
  );

  it.each(['4g', '5g', 'wifi-metered'] as const)(
    'auto + metered healthy profile "%s" resolves normal despite isConnectionExpensive (INV-01)',
    (name) => {
      const snapshot = netInfoFromProfile(NETWORK_PROFILES[name]);

      expect(snapshot.details?.isConnectionExpensive).toBe(true);
      expect(resolveDataMode('auto', snapshot, 'unknown')).toBe('normal');
      expect(resolveDataMode('auto', snapshot, 'ok')).toBe('normal');
    },
  );

  it('cellular-degraded resolves normal by label but low once quality is slow', () => {
    const snapshot = netInfoFromProfile(NETWORK_PROFILES['cellular-degraded']);

    expect(snapshot.details?.cellularGeneration).toBe('4g');
    expect(resolveDataMode('auto', snapshot, 'unknown')).toBe('normal');
    expect(resolveDataMode('auto', snapshot, 'slow')).toBe('low');
  });

  it('resolves the flapping profile to low in BOTH connectivity windows', () => {
    const onlineWindow = netInfoFromProfile(NETWORK_PROFILES.flapping, { online: true });
    const offlineWindow = netInfoFromProfile(NETWORK_PROFILES.flapping, { online: false });

    expect(resolveDataMode('auto', onlineWindow, 'unknown')).toBe('low');
    expect(resolveDataMode('auto', offlineWindow, 'unknown')).toBe('low');
  });

  it('honours an explicit user preference regardless of profile AND quality (INV-03)', () => {
    const normalSnap = netInfoFromProfile(NETWORK_PROFILES.normal);
    const offlineSnap = netInfoFromProfile(NETWORK_PROFILES.offline);
    const degradedSnap = netInfoFromProfile(NETWORK_PROFILES['cellular-degraded']);

    expect(resolveDataMode('low', normalSnap, 'ok')).toBe('low');
    expect(resolveDataMode('normal', offlineSnap, 'unknown')).toBe('normal');
    expect(resolveDataMode('normal', degradedSnap, 'slow')).toBe('normal');
  });
});
