import { renderHook } from '@testing-library/react-native';

const fakeStore: Record<string, string> = {};
jest.mock('@/shared/infrastructure/storage', () => ({
  storage: {
    getItem: jest.fn((key: string) => fakeStore[key] ?? null),
    setItem: jest.fn((key: string, value: string) => {
      fakeStore[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      Reflect.deleteProperty(fakeStore, key);
    }),
  },
}));

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

import { OfflineQueueProvider, useOfflineQueue } from '@/features/chat/application/useOfflineQueue';

describe('useOfflineQueue — canonical isOffline derivation — T2.3 / spec R8+R11 / design D7', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConnectivity = { isConnected: true, isInternetReachable: true, isOnline: true };
    for (const key of Object.keys(fakeStore)) {
      Reflect.deleteProperty(fakeStore, key);
    }
  });

  it('reports isOffline === true behind a captive portal {isConnected:true,isInternetReachable:false}', () => {
    mockConnectivity = { isConnected: true, isInternetReachable: false, isOnline: false };

    const { result } = renderHook(() => useOfflineQueue(), { wrapper: OfflineQueueProvider });

    expect(result.current.isOffline).toBe(true);
  });

  it('reports isOffline === false when fully online', () => {
    mockConnectivity = { isConnected: true, isInternetReachable: true, isOnline: true };

    const { result } = renderHook(() => useOfflineQueue(), { wrapper: OfflineQueueProvider });

    expect(result.current.isOffline).toBe(false);
  });

  it('reports isOffline === true when no active interface {isConnected:false}', () => {
    mockConnectivity = { isConnected: false, isInternetReachable: false, isOnline: false };

    const { result } = renderHook(() => useOfflineQueue(), { wrapper: OfflineQueueProvider });

    expect(result.current.isOffline).toBe(true);
  });

  it('reports isOffline === false during the undetermined cold-start window (online-optimistic)', () => {
    mockConnectivity = { isConnected: null, isInternetReachable: null, isOnline: true };

    const { result } = renderHook(() => useOfflineQueue(), { wrapper: OfflineQueueProvider });

    expect(result.current.isOffline).toBe(false);
  });
});
