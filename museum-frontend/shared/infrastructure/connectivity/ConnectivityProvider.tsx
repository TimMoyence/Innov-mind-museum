import type React from 'react';
import { createContext, useEffect, useState } from 'react';
import type { NetInfoState } from '@react-native-community/netinfo';
import NetInfo from '@react-native-community/netinfo';

import { isOnline } from './isOnline';

/**
 * Tri-state connectivity context (spec R6 / design §D2). `isConnected` and
 * `isInternetReachable` are propagated RAW from NetInfo as `boolean | null`
 * (TD-NI-01: the prior null-to-true coercion is removed), so the undetermined
 * cold-start window reads as `null` (not a fabricated `true`). `isOnline` is the
 * derived canonical signal via {@link isOnline} — online-optimistic on `null`
 * for display, never forcing a confirmed-connectivity side-effect.
 *
 * lib-docs: @react-native-community/netinfo PATTERNS.md:142,265 (nullable type,
 * TD-NI-01 null-coercion fix), PATTERNS.md:181 (don't block render on `fetch()`
 * — subscribe + render last-known state).
 */
interface ConnectivityContextValue {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
  isOnline: boolean;
}

export const ConnectivityContext = createContext<ConnectivityContextValue>({
  isConnected: null,
  isInternetReachable: null,
  isOnline: true,
});

export const ConnectivityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<ConnectivityContextValue>({
    isConnected: null,
    isInternetReachable: null,
    isOnline: true,
  });

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((netState: NetInfoState) => {
      const isConnected = netState.isConnected;
      const isInternetReachable = netState.isInternetReachable;
      setState({
        isConnected,
        isInternetReachable,
        isOnline: isOnline({ isConnected, isInternetReachable }),
      });
    });
    return () => {
      unsubscribe();
    };
  }, []);

  return <ConnectivityContext.Provider value={state}>{children}</ConnectivityContext.Provider>;
};
