/**
 * B-R2 (RED) — M1 registry-parameterised `resolveDataMode`, re-ratified at
 * 10 profiles + 3-arg resolver (run `undefined-network-detection-reliability`,
 * spec §10 #2).
 *
 * Contract evolution (documented, NOT a frozen-test breach): `expectedDataMode`
 * is re-documented as "mode resolved by LABEL ALONE, empty measurement window"
 * (US-11.4) — the matrix therefore feeds the REAL 3-arg resolver
 * (`resolveDataMode(pref, snapshot, quality)`, INV-18) with quality `'unknown'`.
 * The four new profiles extend the matrix; `cellular-degraded` proves the
 * label/measurement split: 'normal' by label, 'low' once the engine says slow.
 *
 * Pins:
 *   - every profile resolves its expectedDataMode at quality 'unknown' (≡ 'ok',
 *     US-04.4) — incl. metered 4g/5g/wifi-metered ⇒ 'normal' (INV-01, the
 *     trigger bug can no longer exist)
 *   - quality 'slow' ⇒ 'low' for healthy-label profiles (INV-05)
 *   - flapping low in BOTH windows
 *   - explicit preferences beat every network signal, both axes (INV-03)
 *
 * lib-docs: @react-native-community/netinfo PATTERNS.md:120-130 (§Types).
 * No inline test entities — snapshots via `netInfoFromProfile` (registry truth).
 */
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

  // INV-01 — the trigger-bug class: a metered (isConnectionExpensive:true)
  // healthy connection MUST resolve 'normal' in auto. These three profiles are
  // exactly the rows the 6-profile registry was blind to.
  it.each(['4g', '5g', 'wifi-metered'] as const)(
    'auto + metered healthy profile "%s" resolves normal despite isConnectionExpensive (INV-01)',
    (name) => {
      const snapshot = netInfoFromProfile(NETWORK_PROFILES[name]);

      expect(snapshot.details?.isConnectionExpensive).toBe(true);
      expect(resolveDataMode('auto', snapshot, 'unknown')).toBe('normal');
      expect(resolveDataMode('auto', snapshot, 'ok')).toBe('normal');
    },
  );

  // US-11.4 / INV-05 — cellular-degraded: 'normal' by label (4g), 'low' once
  // the MEASUREMENT says slow. The two verdicts live on different axes.
  it('cellular-degraded resolves normal by label but low once quality is slow', () => {
    const snapshot = netInfoFromProfile(NETWORK_PROFILES['cellular-degraded']);

    expect(snapshot.details?.cellularGeneration).toBe('4g');
    expect(resolveDataMode('auto', snapshot, 'unknown')).toBe('normal');
    expect(resolveDataMode('auto', snapshot, 'slow')).toBe('low');
  });

  it('resolves the flapping profile to low in BOTH connectivity windows', () => {
    const onlineWindow = netInfoFromProfile(NETWORK_PROFILES.flapping, { online: true });
    const offlineWindow = netInfoFromProfile(NETWORK_PROFILES.flapping, { online: false });

    // online window is a 3g cellular base → low (D-03); offline window → low (D-02).
    expect(resolveDataMode('auto', onlineWindow, 'unknown')).toBe('low');
    expect(resolveDataMode('auto', offlineWindow, 'unknown')).toBe('low');
  });

  it('honours an explicit user preference regardless of profile AND quality (INV-03)', () => {
    const normalSnap = netInfoFromProfile(NETWORK_PROFILES.normal);
    const offlineSnap = netInfoFromProfile(NETWORK_PROFILES.offline);
    const degradedSnap = netInfoFromProfile(NETWORK_PROFILES['cellular-degraded']);

    expect(resolveDataMode('low', normalSnap, 'ok')).toBe('low');
    expect(resolveDataMode('normal', offlineSnap, 'unknown')).toBe('normal');
    // preference 'normal' beats even a measured-slow network (INV-03 — both axes).
    expect(resolveDataMode('normal', degradedSnap, 'slow')).toBe('normal');
  });
});
