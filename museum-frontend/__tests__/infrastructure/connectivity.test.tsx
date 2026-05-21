import React from 'react';

type NetInfoCallback = (state: {
  isConnected: boolean;
  isInternetReachable: boolean | null;
}) => void;

let netInfoCallback: NetInfoCallback | null = null;
const mockUnsubscribe = jest.fn();

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    addEventListener: jest.fn((cb: NetInfoCallback) => {
      netInfoCallback = cb;
      return mockUnsubscribe;
    }),
  },
}));

import { render, act } from '@testing-library/react-native';
import { renderHook } from '@testing-library/react-native';
import { Text } from 'react-native';
import {
  ConnectivityProvider,
  ConnectivityContext,
} from '@/shared/infrastructure/connectivity/ConnectivityProvider';
import { useConnectivity } from '@/shared/infrastructure/connectivity/useConnectivity';

describe('ConnectivityProvider', () => {
  beforeEach(() => {
    netInfoCallback = null;
    jest.clearAllMocks();
  });

  it('provides tri-state default: undetermined connectivity, online-optimistic', () => {
    const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
      <ConnectivityProvider>{children}</ConnectivityProvider>
    );

    const { result } = renderHook(() => React.useContext(ConnectivityContext), {
      wrapper,
    });

    expect(result.current).not.toBeNull();
    // TD-NI-01: the cold-start window reads as null (no fabricated `true`),
    // while the derived `isOnline` stays online-optimistic for display.
    expect(result.current.isConnected).toBeNull();
    expect(result.current.isInternetReachable).toBeNull();
    expect(result.current.isOnline).toBe(true);
  });

  it('updates state when NetInfo fires a disconnected event', () => {
    const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
      <ConnectivityProvider>{children}</ConnectivityProvider>
    );

    const { result } = renderHook(() => React.useContext(ConnectivityContext), {
      wrapper,
    });

    expect(result.current.isConnected).toBeNull();

    act(() => {
      netInfoCallback?.({ isConnected: false, isInternetReachable: false });
    });

    expect(result.current.isConnected).toBe(false);
    expect(result.current.isInternetReachable).toBe(false);
    expect(result.current.isOnline).toBe(false);
  });

  it('propagates null from NetInfo raw (no coercion) and stays online-optimistic', () => {
    const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
      <ConnectivityProvider>{children}</ConnectivityProvider>
    );

    const { result } = renderHook(() => React.useContext(ConnectivityContext), {
      wrapper,
    });

    act(() => {
      netInfoCallback?.({ isConnected: null as unknown as boolean, isInternetReachable: null });
    });

    // TD-NI-01: no `?? true` coercion — the raw null is propagated, but the
    // derived predicate is online-optimistic on an undetermined interface.
    expect(result.current.isConnected).toBeNull();
    expect(result.current.isInternetReachable).toBeNull();
    expect(result.current.isOnline).toBe(true);
  });

  it('unsubscribes from NetInfo on unmount', () => {
    const { unmount } = render(
      <ConnectivityProvider>
        <Text>child</Text>
      </ConnectivityProvider>,
    );

    unmount();

    expect(mockUnsubscribe).toHaveBeenCalled();
  });
});

describe('useConnectivity', () => {
  it('returns context value from ConnectivityProvider', () => {
    const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
      <ConnectivityProvider>{children}</ConnectivityProvider>
    );

    const { result } = renderHook(() => useConnectivity(), { wrapper });

    expect(result.current.isConnected).toBeNull();
    expect(result.current.isInternetReachable).toBeNull();
    expect(result.current.isOnline).toBe(true);
  });
});
