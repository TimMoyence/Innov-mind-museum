import type React from 'react';
import { createContext, useEffect, useState } from 'react';
import type { NetInfoState } from '@react-native-community/netinfo';
import NetInfo from '@react-native-community/netinfo';

import { isOnline } from './isOnline';

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
