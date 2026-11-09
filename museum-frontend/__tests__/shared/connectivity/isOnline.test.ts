import { isOnline, type ConnectivityState } from '@/shared/infrastructure/connectivity/isOnline';

describe('isOnline (canonical connectivity predicate) — T1.1 / spec R1+R2 / design D1', () => {
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
    expect(state).toEqual({ isConnected: true, isInternetReachable: true });
  });
});
