/**
 * Canonical connectivity predicate — the single source of truth for "are we
 * online?" across `museum-frontend`. Pure function (no NetInfo / React import)
 * so it is unit-testable and reusable by both the `onlineManager` bridge and the
 * React `ConnectivityProvider`. Mirrors the `resolveDataMode` pure-function
 * pattern (DataModeProvider.tsx).
 *
 * Semantics (design §D1 truth table — load-bearing): online iff neither field
 * is *explicitly* `false`, i.e.
 *   `isConnected !== false && isInternetReachable !== false`.
 *
 * `null` / `undefined` on either field is **online-optimistic** (predicate
 * returns `true`) so we never report offline during the undetermined cold-start
 * probe window. Only an explicit `false` on either the interface
 * (`isConnected === false`) or the reachability probe
 * (`isInternetReachable === false`, e.g. captive portal) forces offline — and
 * an explicit reachability `false` wins even over an undetermined interface
 * (row `{null, false}` → offline).
 *
 * lib-docs: @react-native-community/netinfo PATTERNS.md:142 (treat both fields
 * as `boolean|null`, never cast), PATTERNS.md:173 (DON'T trust `isConnected:true`
 * alone — must AND reachability).
 */

/**
 * Input shape for {@link isOnline}. Mirrors the relevant subset of NetInfo's
 * state. Both fields are nullable (the nullable type is load-bearing for the
 * online-optimistic semantics; never cast to `boolean`).
 */
export interface ConnectivityState {
  isConnected: boolean | null | undefined;
  isInternetReachable: boolean | null | undefined;
}

/**
 * Returns `true` iff an active interface exists and the internet is not
 * explicitly unreachable. Online-optimistic on `null`/`undefined`. Pure.
 */
export function isOnline(state: ConnectivityState): boolean {
  return state.isConnected !== false && state.isInternetReachable !== false;
}
