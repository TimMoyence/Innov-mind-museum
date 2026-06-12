/**
 * B-R2 (RED) — helper A `netInfoFromProfile`, re-ratified: metered derivation
 * (run `undefined-network-detection-reliability`, spec §10 #6).
 *
 * Contract evolution (documented, NOT a frozen-test breach): the W1 pins
 * `details.isConnectionExpensive === false` ratified the hard-coded false of
 * `toNetInfoSnapshot` (networkProfiles.ts:204,214). Superseded by US-11.3:
 * `isConnectionExpensive` now DERIVES from `profile.metered` (online branch)
 * and is FORCED false on the offline branch (US-02.5 — no cost without an
 * interface). The nested-details shape + `isInternetReachable` mirror are
 * unchanged.
 *
 * lib-docs:
 * - @react-native-community/netinfo PATTERNS.md:120-130 (§Types — `details`
 *   shape, `cellularGeneration` 2g/3g/4g/5g, `isConnected: boolean | null`).
 *
 * No inline test entities — profiles sourced from the registry.
 */
import { NETWORK_PROFILES } from '@/shared/infrastructure/connectivity/networkProfiles';
import { netInfoFromProfile } from '@/shared/testing/netInfoFromProfile';

describe('netInfoFromProfile (helper A — metered derivation, B-R2)', () => {
  it('maps the offline profile to a disconnected, never-expensive snapshot (US-02.5)', () => {
    const snap = netInfoFromProfile(NETWORK_PROFILES.offline);

    expect(snap.isConnected).toBe(false);
    expect(snap.type).toBe('none');
    expect(snap.details).toEqual({
      isConnectionExpensive: false,
      cellularGeneration: null,
    });
  });

  it('maps the 2g profile to a connected cellular snapshot that is METERED (US-11.3)', () => {
    const snap = netInfoFromProfile(NETWORK_PROFILES['2g']);

    expect(snap.isConnected).toBe(true);
    expect(snap.type).toBe('cellular');
    expect(snap.details?.cellularGeneration).toBe('2g');
    // Contract change: derives from profile.metered (true for all cellular),
    // no longer the hard-coded false of W1.
    expect(snap.details?.isConnectionExpensive).toBe(true);
  });

  it('maps the normal (wifi) profile to a connected NON-metered wifi snapshot', () => {
    const snap = netInfoFromProfile(NETWORK_PROFILES.normal);

    expect(snap.isConnected).toBe(true);
    expect(snap.type).toBe('wifi');
    expect(snap.details?.cellularGeneration).toBeNull();
    expect(snap.details?.isConnectionExpensive).toBe(false);
  });

  it('maps wifi-metered to a wifi snapshot that IS expensive (Android hotspot case, US-02.6)', () => {
    const snap = netInfoFromProfile(NETWORK_PROFILES['wifi-metered']);

    expect(snap.isConnected).toBe(true);
    expect(snap.type).toBe('wifi');
    expect(snap.details?.cellularGeneration).toBeNull();
    expect(snap.details?.isConnectionExpensive).toBe(true);
  });

  it('derives details.isConnectionExpensive === profile.metered for EVERY online profile (US-11.3)', () => {
    for (const profile of Object.values(NETWORK_PROFILES)) {
      if (profile.netinfoType === 'none') continue;
      const snap = netInfoFromProfile(profile);

      expect(snap.details?.isConnectionExpensive).toBe(profile.metered);
    }
  });

  it('emits the canonical nested shape for every ratified profile', () => {
    for (const profile of Object.values(NETWORK_PROFILES)) {
      const snap = netInfoFromProfile(profile);

      // shape contract: {type, isConnected, isInternetReachable, details:{...}}
      expect(snap).toHaveProperty('type');
      expect(snap).toHaveProperty('isConnected');
      expect(snap).toHaveProperty('isInternetReachable');
      expect(snap).toHaveProperty('details');
      expect(snap.details).toHaveProperty('isConnectionExpensive');
      expect(snap.details).toHaveProperty('cellularGeneration');
    }
  });

  it('honours an explicit online override (flapping disconnected window)', () => {
    const offWindow = netInfoFromProfile(NETWORK_PROFILES.flapping, { online: false });
    expect(offWindow.isConnected).toBe(false);
    expect(offWindow.isInternetReachable).toBe(false);
    // Offline branch forces non-expensive even though flapping is metered (US-02.5).
    expect(offWindow.details?.isConnectionExpensive).toBe(false);

    const onWindow = netInfoFromProfile(NETWORK_PROFILES.flapping, { online: true });
    expect(onWindow.isConnected).toBe(true);
    expect(onWindow.details?.cellularGeneration).toBe('3g');
    expect(onWindow.details?.isConnectionExpensive).toBe(true);
  });

  it('reports internet reachable only when connected', () => {
    expect(netInfoFromProfile(NETWORK_PROFILES.offline).isInternetReachable).toBe(false);
    expect(netInfoFromProfile(NETWORK_PROFILES.normal).isInternetReachable).toBe(true);
  });
});
