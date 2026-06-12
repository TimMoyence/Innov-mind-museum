/**
 * Helper A (TEST-ONLY) — `netInfoFromProfile`.
 *
 * Maps a ratified {@link NetworkProfile} to a structural NetInfo snapshot whose
 * `isConnectionExpensive` + `cellularGeneration` live nested under `details`
 * (design anchor §3 / spec R1), exactly the shape the REAL `resolveDataMode`
 * consumes. `isConnectionExpensive` derives from `profile.metered` on the
 * online branch and is forced `false` offline (US-11.3 / US-02.5 — via the
 * registry's `toNetInfoSnapshot`, single source of truth). `isInternetReachable`
 * mirrors `isConnected` (a degraded-but-present interface is still "reachable"
 * in the simulation; offline is unreachable).
 *
 * NEVER imported by `app/**` — enforced by the `no-restricted-imports` boundary
 * (eslint.config.mjs). This module imports neither `react` nor
 * `@react-native-community/netinfo`; it reuses the registry's pure
 * `toNetInfoSnapshot` mapper (single source of truth for the nested shape).
 *
 * lib-docs: @react-native-community/netinfo PATTERNS.md:120-130 (§Types —
 * `details` shape, `cellularGeneration` 2g/3g/4g/5g, `isConnected: boolean | null`)
 * + §4 (`isConnected` alone ≠ "API reachable").
 */
import {
  toNetInfoSnapshot,
  type NetInfoSnapshot,
  type NetworkProfile,
} from '@/shared/infrastructure/connectivity/networkProfiles';

/** NetInfo snapshot enriched with the `isInternetReachable` field the harness asserts on. */
export interface SimNetInfoSnapshot extends NetInfoSnapshot {
  readonly isInternetReachable: boolean | null;
}

/**
 * Builds a {@link SimNetInfoSnapshot} for a profile, consumable by
 * `resolveDataMode('auto', snapshot)`.
 *
 * @param profile a ratified network profile.
 * @param options.online override the connected state. Defaults to "connected"
 *   for every profile except `offline`. For `flapping`, pass `{online:false}`
 *   to model the disconnected window and `{online:true}` for the online window.
 */
export function netInfoFromProfile(
  profile: NetworkProfile,
  options?: { online?: boolean },
): SimNetInfoSnapshot {
  const base = toNetInfoSnapshot(profile, options);
  return {
    ...base,
    isInternetReachable: base.isConnected === true,
  };
}
