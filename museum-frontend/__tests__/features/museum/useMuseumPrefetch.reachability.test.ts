import { renderHook, waitFor } from '@testing-library/react-native';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

const mockFetchLowDataPack = jest.fn();
jest.mock('@/features/museum/infrastructure/lowDataPackApi', () => ({
  fetchLowDataPack: (...args: unknown[]) => mockFetchLowDataPack(...args),
}));

const mockNetInfoFetch = jest.fn();
jest.mock('@react-native-community/netinfo', () => ({
  fetch: () => mockNetInfoFetch(),
}));

const mockBulkStore = jest.fn();
jest.mock('@/features/chat/application/chatLocalCache', () => ({
  useChatLocalCacheStore: (selector: (state: { bulkStore: jest.Mock }) => unknown) =>
    selector({ bulkStore: mockBulkStore }),
}));

let mockIsLowData = false;
jest.mock('@/features/chat/application/DataModeProvider', () => ({
  useDataMode: () => ({ isLowData: mockIsLowData }),
}));

import {
  useMuseumPrefetch,
  _resetPrefetchTimestamps,
} from '@/features/museum/application/useMuseumPrefetch';
import type { LowDataPack } from '@/features/museum/infrastructure/lowDataPackApi';

function makeLowDataPack(overrides?: Partial<LowDataPack>): LowDataPack {
  return {
    museumId: 'louvre',
    locale: 'en',
    generatedAt: new Date().toISOString(),
    entries: [
      { question: 'Who painted the Mona Lisa?', answer: 'Leonardo da Vinci', source: 'cache' },
    ],
    ...overrides,
  };
}

describe('useMuseumPrefetch — reachability gate — T2.2 / spec R7 / TD-NI-02', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _resetPrefetchTimestamps();
    mockIsLowData = false;
    mockFetchLowDataPack.mockResolvedValue(makeLowDataPack());
  });

  it('does NOT prefetch on wifi behind a captive portal (isInternetReachable === false)', async () => {
    mockNetInfoFetch.mockResolvedValue({
      type: 'wifi',
      isConnected: true,
      isInternetReachable: false,
    });

    renderHook(() => {
      useMuseumPrefetch('louvre', 'en');
    });

    await waitFor(() => {
      expect(mockNetInfoFetch).toHaveBeenCalled();
    });
    await new Promise((r) => setTimeout(r, 50));

    expect(mockFetchLowDataPack).not.toHaveBeenCalled();
    expect(mockBulkStore).not.toHaveBeenCalled();
  });

  it('DOES prefetch on wifi when the internet is reachable + data-mode allows', async () => {
    mockNetInfoFetch.mockResolvedValue({
      type: 'wifi',
      isConnected: true,
      isInternetReachable: true,
    });

    renderHook(() => {
      useMuseumPrefetch('louvre', 'en');
    });

    await waitFor(() => {
      expect(mockFetchLowDataPack).toHaveBeenCalledWith('louvre', 'en');
    });
    expect(mockBulkStore).toHaveBeenCalledTimes(1);
  });

  it('does NOT prefetch when offline (isConnected === false) even though not in low-data mode', async () => {
    mockNetInfoFetch.mockResolvedValue({
      type: 'cellular',
      isConnected: false,
      isInternetReachable: false,
    });

    renderHook(() => {
      useMuseumPrefetch('louvre', 'en');
    });

    await waitFor(() => {
      expect(mockNetInfoFetch).toHaveBeenCalled();
    });
    await new Promise((r) => setTimeout(r, 50));

    expect(mockFetchLowDataPack).not.toHaveBeenCalled();
  });
});
