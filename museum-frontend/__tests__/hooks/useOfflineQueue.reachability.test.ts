/**
 * RED test — T2.3 (run 2026-05-21-connectivity-offline-first).
 *
 * Proves `useOfflineQueue` derives `isOffline: !isConnected`
 * (useOfflineQueue.ts:65) off the coerced connectivity value — so a captive
 * portal (`{isConnected:true, isInternetReachable:false}`) reads as ONLINE
 * (`isOffline === false`) even though no internet is reachable.
 *
 * Spec R8/R11 derivation, design §D7. Target: `isOffline = !isOnline(...)`
 * sourced from the now-tri-state `useConnectivity()` (canonical predicate).
 *
 * lib-docs cited: @react-native-community/netinfo PATTERNS.md:173 (reachable !=
 * connected).
 *
 * RED contract: the captive-portal case FAILS before T2.3 because the current
 * derivation reads only `isConnected` (true) → `isOffline === false`.
 */
import { renderHook } from '@testing-library/react-native';

// ── Mocks ────────────────────────────────────────────────────────────────────
const fakeStore: Record<string, string> = {};
jest.mock('@/shared/infrastructure/storage', () => ({
  storage: {
    getItem: jest.fn((key: string) => fakeStore[key] ?? null),
    setItem: jest.fn((key: string, value: string) => {
      fakeStore[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- test cleanup
      delete fakeStore[key];
    }),
  },
}));

// Tri-state connectivity context (post-T2.1 shape): isConnected/isInternetReachable
// nullable + a derived canonical `isOnline`.
let mockConnectivity: {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
  isOnline: boolean;
} = { isConnected: true, isInternetReachable: true, isOnline: true };

jest.mock('@/shared/infrastructure/connectivity/useConnectivity', () => ({
  useConnectivity: () => mockConnectivity,
}));

jest.mock('@/features/chat/application/offlineImageStorage', () => ({
  persistOfflineImage: jest.fn((uri: string) => Promise.resolve(`persistent://${uri}`)),
  cleanupOfflineImage: jest.fn(),
  cleanupOfflineImages: jest.fn(),
}));

import { useOfflineQueue } from '@/features/chat/application/useOfflineQueue';

describe('useOfflineQueue — canonical isOffline derivation — T2.3 / spec R8+R11 / design D7', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConnectivity = { isConnected: true, isInternetReachable: true, isOnline: true };
    for (const key of Object.keys(fakeStore)) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- test cleanup
      delete fakeStore[key];
    }
  });

  it('reports isOffline === true behind a captive portal {isConnected:true,isInternetReachable:false}', () => {
    mockConnectivity = { isConnected: true, isInternetReachable: false, isOnline: false };

    const { result } = renderHook(() => useOfflineQueue());

    expect(result.current.isOffline).toBe(true);
  });

  it('reports isOffline === false when fully online', () => {
    mockConnectivity = { isConnected: true, isInternetReachable: true, isOnline: true };

    const { result } = renderHook(() => useOfflineQueue());

    expect(result.current.isOffline).toBe(false);
  });

  it('reports isOffline === true when no active interface {isConnected:false}', () => {
    mockConnectivity = { isConnected: false, isInternetReachable: false, isOnline: false };

    const { result } = renderHook(() => useOfflineQueue());

    expect(result.current.isOffline).toBe(true);
  });

  it('reports isOffline === false during the undetermined cold-start window (online-optimistic)', () => {
    mockConnectivity = { isConnected: null, isInternetReachable: null, isOnline: true };

    const { result } = renderHook(() => useOfflineQueue());

    expect(result.current.isOffline).toBe(false);
  });
});
