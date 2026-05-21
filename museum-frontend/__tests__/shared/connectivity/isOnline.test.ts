/**
 * RED test — T1.1 (run 2026-05-21-connectivity-offline-first).
 *
 * Proves the absence of the canonical `isOnline(state)` pure predicate +
 * `ConnectivityState` type in `shared/infrastructure/connectivity/isOnline.ts`.
 *
 * Spec R1/R2, design §D1 truth table. The 10-row table below is copied
 * verbatim from design.md §D1 (load-bearing — covers spec R2's 8 rows plus the
 * two explicit-unreachable rows).
 *
 * Semantics: online iff `isConnected === true && isInternetReachable !== false`.
 * `null`/`undefined` on either field is online-optimistic (predicate true) UNLESS
 * `isInternetReachable === false` (explicit unreachability wins).
 *
 * lib-docs cited: @react-native-community/netinfo PATTERNS.md:142 (treat both
 * fields as `boolean|null`, never cast), PATTERNS.md:173 (DON'T trust
 * `isConnected:true` alone — must AND reachability).
 *
 * RED contract: FAILS before T1.1 because the module/function does not exist
 * (import resolution error / `isOnline is not a function`).
 */
import { isOnline, type ConnectivityState } from '@/shared/infrastructure/connectivity/isOnline';

describe('isOnline (canonical connectivity predicate) — T1.1 / spec R1+R2 / design D1', () => {
  // [isConnected, isInternetReachable, expected, rationale]
  const TRUTH_TABLE: readonly [
    ConnectivityState['isConnected'],
    ConnectivityState['isInternetReachable'],
    boolean,
    string,
  ][] = [
    [true, true, true, 'confirmed online'],
    [true, null, true, 'online-optimistic (probe pending)'],
    [true, undefined, true, 'online-optimistic'],
    [null, null, true, 'cold-start undetermined -> optimistic'],
    [undefined, undefined, true, 'undetermined -> optimistic'],
    [true, false, false, 'active interface, internet explicitly unreachable (captive portal)'],
    [false, true, false, 'no active interface'],
    [false, false, false, 'no interface'],
    [false, null, false, 'no interface'],
    [null, false, false, 'explicit unreachable wins over undetermined interface'],
  ];

  it.each(TRUTH_TABLE)(
    'isOnline({isConnected:%s, isInternetReachable:%s}) === %s (%s)',
    (isConnected, isInternetReachable, expected) => {
      expect(isOnline({ isConnected, isInternetReachable })).toBe(expected);
    },
  );

  it('is a pure function: same input always yields the same output, no side effects', () => {
    const state: ConnectivityState = { isConnected: true, isInternetReachable: true };
    const first = isOnline(state);
    const second = isOnline(state);
    expect(first).toBe(second);
    expect(first).toBe(true);
    // The input object must not be mutated by the predicate.
    expect(state).toEqual({ isConnected: true, isInternetReachable: true });
  });
});
