export interface ConnectivityState {
  isConnected: boolean | null | undefined;
  isInternetReachable: boolean | null | undefined;
}

export function isOnline(state: ConnectivityState): boolean {
  return state.isConnected !== false && state.isInternetReachable !== false;
}
