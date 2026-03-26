import type React from 'react';
import { createContext, useEffect, useState } from 'react';
import type { NetInfoState } from '@react-native-community/netinfo';
import NetInfo from '@react-native-community/netinfo';

interface ConnectivityContextValue {
  isConnected: boolean;
  isInternetReachable: boolean | null;
}

export const ConnectivityContext = createContext<ConnectivityContextValue>({
  isConnected: true,
  isInternetReachable: null,
});

export const ConnectivityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<ConnectivityContextValue>({
    isConnected: true,
    isInternetReachable: null,
  });

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((netState: NetInfoState) => {
      setState({
        isConnected: netState.isConnected ?? true,
        isInternetReachable: netState.isInternetReachable,
      });
    });
    return () => { unsubscribe(); };
  }, []);

  return (
    <ConnectivityContext.Provider value={state}>
      {children}
    </ConnectivityContext.Provider>
  );
};
