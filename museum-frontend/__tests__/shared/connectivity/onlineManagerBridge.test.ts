/**
 * RED tests — T1.2 + T1.3 (run 2026-05-21-connectivity-offline-first).
 *
 * T1.2 — proves the absence of the single NetInfo -> `onlineManager` bridge
 *        installer `installOnlineManagerBridge()` in
 *        `shared/infrastructure/connectivity/onlineManagerBridge.ts`.
 * T1.3 — proves nothing wires `onlineManager` at bootstrap: importing
 *        `@/shared/data/queryClient` must have installed an event listener that
 *        flips `onlineManager.isOnline()` on a NetInfo emit.
 *
 * Spec R3 (onlineManager fed by NetInfo via the canonical predicate), R4
 * (teardown calls the NetInfo unsubscribe). Design §D2/§D4.
 *
 * lib-docs cited:
 * - @tanstack/react-query PATTERNS.md:174 (wire onlineManager ONCE at bootstrap),
 *   PATTERNS.md:181-191 (refetchOnReconnect needs onlineManager on RN),
 *   PATTERNS.md:84 (default networkMode 'online' pauses only when onlineManager
 *   knows offline).
 * - @react-native-community/netinfo PATTERNS.md:134 (always call unsubscribe),
 *   PATTERNS.md:243-262 (TD-14 wiring snippet — predicate, not raw isConnected).
 *
 * RED contract:
 * - T1.2 block FAILS before the module exists (import resolution error).
 * - T1.3 block FAILS because `queryClient.ts` currently calls no installer, so
 *   emitting a NetInfo change does not move `onlineManager.isOnline()`.
 *
 * Uses the real `onlineManager` singleton from @tanstack/react-query (a pure-JS
 * export) and a controllable NetInfo mock (capture the addEventListener
 * callback + a jest.fn unsubscribe — official-mock-shaped).
 */
import { onlineManager } from '@tanstack/react-query';
import type { NetInfoState } from '@react-native-community/netinfo';

// ── NetInfo mock (controllable emit + official-mock-shaped unsubscribe) ───────
type NetInfoListener = (state: Partial<NetInfoState>) => void;
let netInfoListener: NetInfoListener | null = null;
const mockUnsubscribe = jest.fn();
const mockAddEventListener = jest.fn((cb: NetInfoListener) => {
  netInfoListener = cb;
  return mockUnsubscribe;
});

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    addEventListener: (cb: NetInfoListener) => mockAddEventListener(cb),
  },
  addEventListener: (cb: NetInfoListener) => mockAddEventListener(cb),
}));

// AsyncStorage is pulled in transitively by queryClient.ts (T1.3) — mock it.
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
}));

/**
 * Dynamically loads the not-yet-existing bridge module. Kept as a runtime
 * `require` (not a static `import`) so the RED phase fails at module resolution
 * rather than a static-import compile shape, and green can satisfy it later.
 */
interface OnlineManagerBridgeModule {
  installOnlineManagerBridge: () => () => void;
}
const loadBridge = (): OnlineManagerBridgeModule =>
  require('@/shared/infrastructure/connectivity/onlineManagerBridge') as OnlineManagerBridgeModule;

const emit = (state: Partial<NetInfoState>): void => {
  if (!netInfoListener) throw new Error('No NetInfo listener registered by the bridge');
  netInfoListener(state);
};

beforeEach(() => {
  netInfoListener = null;
  mockUnsubscribe.mockClear();
  mockAddEventListener.mockClear();
  // Reset the singleton to a known online state so a prior test cannot leak.
  onlineManager.setOnline(true);
});

describe('installOnlineManagerBridge — T1.2 / spec R3+R4 / design D2+D4', () => {
  it('emitting NetInfo {isConnected:false} drives onlineManager.isOnline() to false', () => {
    const { installOnlineManagerBridge } = loadBridge();
    const unsubscribe = installOnlineManagerBridge();

    emit({ isConnected: false, isInternetReachable: false });
    expect(onlineManager.isOnline()).toBe(false);

    unsubscribe();
  });

  it('emitting NetInfo {isConnected:true,isInternetReachable:true} drives onlineManager.isOnline() to true', () => {
    const { installOnlineManagerBridge } = loadBridge();
    const unsubscribe = installOnlineManagerBridge();

    emit({ isConnected: false, isInternetReachable: false });
    expect(onlineManager.isOnline()).toBe(false);

    emit({ isConnected: true, isInternetReachable: true });
    expect(onlineManager.isOnline()).toBe(true);

    unsubscribe();
  });

  it('uses the canonical predicate, not raw isConnected: {isConnected:true,isInternetReachable:false} => offline', () => {
    const { installOnlineManagerBridge } = loadBridge();
    const unsubscribe = installOnlineManagerBridge();

    // Captive portal: active interface, internet explicitly unreachable.
    emit({ isConnected: true, isInternetReachable: false });
    expect(onlineManager.isOnline()).toBe(false);

    unsubscribe();
  });

  it('the returned unsubscribe tears down the NetInfo listener (no leak — netinfo PATTERNS.md:134)', () => {
    const { installOnlineManagerBridge } = loadBridge();
    const unsubscribe = installOnlineManagerBridge();

    expect(mockUnsubscribe).not.toHaveBeenCalled();
    unsubscribe();
    expect(mockUnsubscribe).toHaveBeenCalled();
  });
});

describe('queryClient bootstrap install — T1.3 / spec R3 / design D4', () => {
  it('importing @/shared/data/queryClient installs the bridge (NetInfo emit flips onlineManager)', () => {
    // Importing the module must have run the installer as a side effect.
    require('@/shared/data/queryClient');

    expect(mockAddEventListener).toHaveBeenCalled();

    emit({ isConnected: false, isInternetReachable: false });
    expect(onlineManager.isOnline()).toBe(false);

    emit({ isConnected: true, isInternetReachable: true });
    expect(onlineManager.isOnline()).toBe(true);
  });
});
