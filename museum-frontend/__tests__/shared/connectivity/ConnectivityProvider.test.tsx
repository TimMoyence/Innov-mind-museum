/**
 * RED test — T2.1 (run 2026-05-21-connectivity-offline-first).
 *
 * Proves the current `ConnectivityProvider` is NOT tri-state: it coerces
 * `netState.isConnected ?? true` (ConnectivityProvider.tsx:25), types the
 * context `isConnected: boolean` (non-nullable, :7), defaults the initial value
 * to `isConnected: true` (:13,18), and exposes NO derived `isOnline`.
 *
 * Spec R5/R6, design §D2. Target shape:
 *   { isConnected: boolean|null, isInternetReachable: boolean|null, isOnline: boolean }
 * Initial: { isConnected: null, isInternetReachable: null, isOnline: true }.
 *
 * lib-docs cited: @react-native-community/netinfo PATTERNS.md:142,265 (nullable,
 * TD-NI-01 `?? true` fix), PATTERNS.md:181 (don't block render on fetch() —
 * subscribe + render last-known state).
 *
 * RED contract: FAILS before T2.1 because (a) initial `isConnected` is `true`
 * not `null`, and (b) `isOnline` is `undefined` on the context.
 */
import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import type { NetInfoState } from '@react-native-community/netinfo';

// ── NetInfo mock (capture the addEventListener callback) ──────────────────────
type NetInfoListener = (state: Partial<NetInfoState>) => void;
let netInfoListener: NetInfoListener | null = null;
const mockUnsubscribe = jest.fn();

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    addEventListener: jest.fn((cb: NetInfoListener) => {
      netInfoListener = cb;
      return mockUnsubscribe;
    }),
  },
}));

import {
  ConnectivityProvider,
  ConnectivityContext,
} from '@/shared/infrastructure/connectivity/ConnectivityProvider';

const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ConnectivityProvider>{children}</ConnectivityProvider>
);

const emit = (state: Partial<NetInfoState>): void => {
  if (!netInfoListener) throw new Error('No NetInfo listener registered by the provider');
  act(() => {
    netInfoListener?.(state);
  });
};

describe('ConnectivityProvider — tri-state / nullable — T2.1 / spec R5+R6 / design D2', () => {
  beforeEach(() => {
    netInfoListener = null;
    jest.clearAllMocks();
  });

  it('initial context is online-optimistic but undetermined: isConnected === null (NOT true), isOnline === true', () => {
    const { result } = renderHook(() => React.useContext(ConnectivityContext), { wrapper });

    expect(result.current.isConnected).toBeNull();
    expect(result.current.isInternetReachable).toBeNull();
    expect(result.current.isOnline).toBe(true);
  });

  it('after a {isConnected:false} emit, isOnline === false and the raw nullable value is propagated', () => {
    const { result } = renderHook(() => React.useContext(ConnectivityContext), { wrapper });

    emit({ isConnected: false, isInternetReachable: false });

    expect(result.current.isConnected).toBe(false);
    expect(result.current.isOnline).toBe(false);
  });

  it('captive portal {isConnected:true,isInternetReachable:false} => isOnline === false (predicate, not raw)', () => {
    const { result } = renderHook(() => React.useContext(ConnectivityContext), { wrapper });

    emit({ isConnected: true, isInternetReachable: false });

    expect(result.current.isConnected).toBe(true);
    expect(result.current.isInternetReachable).toBe(false);
    expect(result.current.isOnline).toBe(false);
  });

  it('does NOT coerce a null isConnected emit to true (drops the `?? true` — TD-NI-01)', () => {
    const { result } = renderHook(() => React.useContext(ConnectivityContext), { wrapper });

    emit({ isConnected: null, isInternetReachable: null });

    expect(result.current.isConnected).toBeNull();
    // null/null is online-optimistic for display.
    expect(result.current.isOnline).toBe(true);
  });
});
