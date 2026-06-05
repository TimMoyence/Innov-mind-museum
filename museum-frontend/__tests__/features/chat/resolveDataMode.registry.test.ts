/**
 * RED (W1-L1-08) — M1 registry-parameterised `resolveDataMode`.
 *
 * Feeds EVERY ratified profile through the test-only `netInfoFromProfile` helper
 * into the REAL `resolveDataMode('auto', snapshot)` (no mock of the resolver) and
 * asserts the resolved mode equals each profile's `expectedDataMode` (spec R2).
 * Flapping is proven in BOTH windows (online window → its base 3g still 'low';
 * offline window → 'low').
 *
 * Fails RED because `netInfoFromProfile` (helper A, `@/shared/testing/...`) does
 * not exist yet.
 *
 * lib-docs:
 * - @react-native-community/netinfo PATTERNS.md:120-130 (§Types) + LESSONS.md:34
 *   (DataModeProvider correctly reads isConnected/cellularGeneration/isConnectionExpensive).
 */
import { resolveDataMode } from '@/features/chat/application/DataModeProvider';
import { NETWORK_PROFILES } from '@/shared/infrastructure/connectivity/networkProfiles';
import { netInfoFromProfile } from '@/shared/testing/netInfoFromProfile';

describe('M1 — resolveDataMode over the network profile registry', () => {
  it.each(Object.values(NETWORK_PROFILES))(
    "auto + $name profile resolves to its expectedDataMode '$expectedDataMode'",
    (profile) => {
      const snapshot = netInfoFromProfile(profile);

      expect(resolveDataMode('auto', snapshot)).toBe(profile.expectedDataMode);
    },
  );

  it('resolves the flapping profile to low in BOTH connectivity windows', () => {
    const onlineWindow = netInfoFromProfile(NETWORK_PROFILES.flapping, { online: true });
    const offlineWindow = netInfoFromProfile(NETWORK_PROFILES.flapping, { online: false });

    // online window is a 3g cellular base → low; offline window → low.
    expect(resolveDataMode('auto', onlineWindow)).toBe('low');
    expect(resolveDataMode('auto', offlineWindow)).toBe('low');
  });

  it('honours an explicit user preference regardless of profile', () => {
    const normalSnap = netInfoFromProfile(NETWORK_PROFILES.normal);
    const offlineSnap = netInfoFromProfile(NETWORK_PROFILES.offline);

    expect(resolveDataMode('low', normalSnap)).toBe('low');
    expect(resolveDataMode('normal', offlineSnap)).toBe('normal');
  });
});
