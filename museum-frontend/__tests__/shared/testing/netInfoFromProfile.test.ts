/**
 * RED (W1-L1-02) — helper A `netInfoFromProfile`.
 *
 * Proves the absence of the test-only helper that maps a ratified
 * {@link NetworkProfile} to a structural NetInfo snapshot whose
 * `isConnectionExpensive` + `cellularGeneration` live nested under `details`
 * (design anchor §3 / spec R1). The helper does NOT exist yet — this import
 * resolves to nothing, so the suite fails.
 *
 * lib-docs:
 * - @react-native-community/netinfo PATTERNS.md:120-130 (§Types — `details` shape,
 *   `cellularGeneration` 2g/3g/4g/5g, `isConnected: boolean | null`).
 */
import { NETWORK_PROFILES } from '@/shared/infrastructure/connectivity/networkProfiles';
import { netInfoFromProfile } from '@/shared/testing/netInfoFromProfile';

describe('netInfoFromProfile (helper A)', () => {
  it('maps the offline profile to a disconnected snapshot', () => {
    const snap = netInfoFromProfile(NETWORK_PROFILES.offline);

    expect(snap.isConnected).toBe(false);
    expect(snap.type).toBe('none');
    expect(snap.details).toEqual({
      isConnectionExpensive: false,
      cellularGeneration: null,
    });
  });

  it('maps the 2g profile to a connected cellular snapshot with nested generation', () => {
    const snap = netInfoFromProfile(NETWORK_PROFILES['2g']);

    expect(snap.isConnected).toBe(true);
    expect(snap.type).toBe('cellular');
    expect(snap.details?.cellularGeneration).toBe('2g');
    expect(snap.details?.isConnectionExpensive).toBe(false);
  });

  it('maps the normal (wifi) profile to a connected wifi snapshot', () => {
    const snap = netInfoFromProfile(NETWORK_PROFILES.normal);

    expect(snap.isConnected).toBe(true);
    expect(snap.type).toBe('wifi');
    expect(snap.details?.cellularGeneration).toBeNull();
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

    const onWindow = netInfoFromProfile(NETWORK_PROFILES.flapping, { online: true });
    expect(onWindow.isConnected).toBe(true);
    expect(onWindow.details?.cellularGeneration).toBe('3g');
  });

  it('reports internet reachable only when connected', () => {
    expect(netInfoFromProfile(NETWORK_PROFILES.offline).isInternetReachable).toBe(false);
    expect(netInfoFromProfile(NETWORK_PROFILES.normal).isInternetReachable).toBe(true);
  });
});
