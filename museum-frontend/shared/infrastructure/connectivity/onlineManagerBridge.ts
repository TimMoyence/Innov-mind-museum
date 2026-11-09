import { onlineManager } from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';

import { isOnline } from './isOnline';

let installedUnsubscribe: (() => void) | null = null;

export function installOnlineManagerBridge(): () => void {
  if (installedUnsubscribe) {
    return installedUnsubscribe;
  }

  let netInfoUnsubscribe: (() => void) | null = null;

  onlineManager.setEventListener((setOnline) => {
    netInfoUnsubscribe = NetInfo.addEventListener((state) => {
      setOnline(isOnline(state));
    });
    return netInfoUnsubscribe;
  });

  const unsubscribe = (): void => {
    netInfoUnsubscribe?.();
    netInfoUnsubscribe = null;
    onlineManager.setEventListener(() => undefined);
    installedUnsubscribe = null;
  };

  installedUnsubscribe = unsubscribe;
  return unsubscribe;
}
