import type React from 'react';
import type { NetInfoState } from '@react-native-community/netinfo';

// ── NetInfo mock ────────────────────────────────────────────────────────────
let mockNetInfoState: Partial<NetInfoState> = {
  type: 'wifi' as NetInfoState['type'],
  isConnected: true,
  isInternetReachable: true,
  details: { isConnectionExpensive: false } as NetInfoState['details'],
};

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  useNetInfo: () => mockNetInfoState,
  NetInfoStateType: {
    unknown: 'unknown',
    none: 'none',
    cellular: 'cellular',
    wifi: 'wifi',
    bluetooth: 'bluetooth',
    ethernet: 'ethernet',
    wimax: 'wimax',
    vpn: 'vpn',
    other: 'other',
  },
  NetInfoCellularGeneration: {
    '2g': '2g',
    '3g': '3g',
    '4g': '4g',
    '5g': '5g',
  },
  default: {
    addEventListener: jest.fn(() => jest.fn()),
    fetch: jest.fn(),
    refresh: jest.fn(),
    configure: jest.fn(),
    useNetInfo: () => mockNetInfoState,
    useNetInfoInstance: jest.fn(),
  },
}));

// ── Zustand store mock ──────────────────────────────────────────────────────
let mockPreference: 'auto' | 'low' | 'normal' = 'auto';
const mockSetPreference = jest.fn((p: 'auto' | 'low' | 'normal') => {
  mockPreference = p;
});

jest.mock('@/features/settings/dataModeStore', () => ({
  useDataModePreferenceStore: (
    selector: (s: { preference: string; setPreference: typeof mockSetPreference }) => unknown,
  ) => selector({ preference: mockPreference, setPreference: mockSetPreference }),
}));

// ── AsyncStorage mock (required by Zustand persist) ─────────────────────────
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

import { renderHook } from '@testing-library/react-native';
import {
  DataModeProvider,
  useDataMode,
  resolveDataMode,
} from '@/features/chat/application/DataModeProvider';

const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <DataModeProvider>{children}</DataModeProvider>
);

describe('resolveDataMode (pure logic)', () => {
  it('returns low when preference is low regardless of network', () => {
    expect(
      resolveDataMode('low', {
        isConnected: true,
        type: 'wifi',
        details: { isConnectionExpensive: false },
      }),
    ).toBe('low');
  });

  it('returns normal when preference is normal regardless of network', () => {
    expect(
      resolveDataMode('normal', {
        isConnected: false,
        type: 'none',
        details: null,
      }),
    ).toBe('normal');
  });

  it('returns low when auto + not connected', () => {
    expect(
      resolveDataMode('auto', {
        isConnected: false,
        type: 'none',
        details: null,
      }),
    ).toBe('low');
  });

  it('returns low when auto + cellular 2G', () => {
    expect(
      resolveDataMode('auto', {
        isConnected: true,
        type: 'cellular',
        details: { isConnectionExpensive: true, cellularGeneration: '2g' },
      }),
    ).toBe('low');
  });

  it('returns low when auto + cellular 3G', () => {
    expect(
      resolveDataMode('auto', {
        isConnected: true,
        type: 'cellular',
        details: { isConnectionExpensive: false, cellularGeneration: '3g' },
      }),
    ).toBe('low');
  });

  it('returns normal when auto + cellular 4G (non-expensive)', () => {
    expect(
      resolveDataMode('auto', {
        isConnected: true,
        type: 'cellular',
        details: { isConnectionExpensive: false, cellularGeneration: '4g' },
      }),
    ).toBe('normal');
  });

  it('returns low when auto + connection is expensive', () => {
    expect(
      resolveDataMode('auto', {
        isConnected: true,
        type: 'wifi',
        details: { isConnectionExpensive: true },
      }),
    ).toBe('low');
  });

  it('returns normal when auto + wifi (non-expensive)', () => {
    expect(
      resolveDataMode('auto', {
        isConnected: true,
        type: 'wifi',
        details: { isConnectionExpensive: false },
      }),
    ).toBe('normal');
  });
});

describe('DataModeProvider + useDataMode hook', () => {
  beforeEach(() => {
    mockPreference = 'auto';
    mockNetInfoState = {
      type: 'wifi' as NetInfoState['type'],
      isConnected: true,
      isInternetReachable: true,
      details: { isConnectionExpensive: false } as NetInfoState['details'],
    };
    jest.clearAllMocks();
  });

  it('resolves to normal on auto + wifi', () => {
    const { result } = renderHook(() => useDataMode(), { wrapper });

    expect(result.current.preference).toBe('auto');
    expect(result.current.resolved).toBe('normal');
    expect(result.current.isLowData).toBe(false);
  });

  it('resolves to low on auto + 2G cellular', () => {
    mockNetInfoState = {
      type: 'cellular' as NetInfoState['type'],
      isConnected: true,
      isInternetReachable: true,
      details: {
        isConnectionExpensive: false,
        cellularGeneration: '2g',
      } as NetInfoState['details'],
    };

    const { result } = renderHook(() => useDataMode(), { wrapper });

    expect(result.current.resolved).toBe('low');
    expect(result.current.isLowData).toBe(true);
  });

  it('resolves to low when forced low regardless of wifi', () => {
    mockPreference = 'low';

    const { result } = renderHook(() => useDataMode(), { wrapper });

    expect(result.current.preference).toBe('low');
    expect(result.current.resolved).toBe('low');
    expect(result.current.isLowData).toBe(true);
  });

  it('resolves to normal when forced normal even if disconnected', () => {
    mockPreference = 'normal';
    mockNetInfoState = {
      type: 'none' as NetInfoState['type'],
      isConnected: false,
      isInternetReachable: false,
      details: null,
    };

    const { result } = renderHook(() => useDataMode(), { wrapper });

    expect(result.current.preference).toBe('normal');
    expect(result.current.resolved).toBe('normal');
    expect(result.current.isLowData).toBe(false);
  });

  it('exposes setPreference from the store', () => {
    const { result } = renderHook(() => useDataMode(), { wrapper });

    expect(typeof result.current.setPreference).toBe('function');
  });
});
