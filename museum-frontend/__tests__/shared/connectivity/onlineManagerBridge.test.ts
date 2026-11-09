import { onlineManager } from '@tanstack/react-query';
import type { NetInfoState } from '@react-native-community/netinfo';

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

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
}));

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
    require('@/shared/data/queryClient');

    expect(mockAddEventListener).toHaveBeenCalled();

    emit({ isConnected: false, isInternetReachable: false });
    expect(onlineManager.isOnline()).toBe(false);

    emit({ isConnected: true, isInternetReachable: true });
    expect(onlineManager.isOnline()).toBe(true);
  });
});
