/**
 * Single NetInfo -> TanStack Query `onlineManager` bridge.
 *
 * This is the ONE explicit `NetInfo.addEventListener` wiring that feeds
 * react-query's `onlineManager` from device connectivity, using the canonical
 * {@link isOnline} predicate (NOT a raw `!!state.isConnected`). It is installed
 * once at app bootstrap from `shared/data/queryClient.ts` (a module side-effect,
 * never inside a remounting component) so it is guaranteed wired before any
 * query runs and cannot remount.
 *
 * Without this bridge, `refetchOnReconnect:true` and offline mutation pausing
 * never fire on React Native — react-query's built-in reconnect detection is
 * web-only (falls back to an unreliable `navigator.onLine` shim).
 *
 * lib-docs:
 * - @tanstack/react-query PATTERNS.md:174 (wire onlineManager ONCE at bootstrap),
 *   PATTERNS.md:181-191 (`refetchOnReconnect` needs onlineManager on RN;
 *   default `networkMode:'online'` pauses only when onlineManager knows offline).
 * - @react-native-community/netinfo PATTERNS.md:134 (always call the unsubscribe),
 *   PATTERNS.md:243-262 (TD-14 wiring snippet — predicate, not raw isConnected).
 */
import { onlineManager } from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';

import { isOnline } from './isOnline';

/**
 * Idempotency guard (design §D4 — HMR / double-import safety). A second call is
 * a no-op that returns the existing unsubscribe so we never stack listeners.
 */
let installedUnsubscribe: (() => void) | null = null;

/**
 * Installs the NetInfo -> `onlineManager` bridge once. Returns the NetInfo
 * unsubscribe so tests (and a hypothetical bootstrap re-init) can tear it down
 * cleanly (spec R4). Subsequent calls return the same unsubscribe without
 * registering a second listener.
 */
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
    // Replace our setup with a no-op so `onlineManager` holds no stale cleanup
    // that a subsequent re-install would re-fire. react-query's
    // `setEventListener` already prevents listener stacking (it tears down the
    // prior setup before running the new one); clearing it here keeps a fresh
    // install side-effect-free.
    onlineManager.setEventListener(() => undefined);
    installedUnsubscribe = null;
  };

  installedUnsubscribe = unsubscribe;
  return unsubscribe;
}
