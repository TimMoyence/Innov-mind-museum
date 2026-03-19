import { useContext } from 'react';
import { ConnectivityContext } from './ConnectivityProvider';

export const useConnectivity = () => useContext(ConnectivityContext);
