/**
 * RED test — T2.2 (run 2026-05-21-connectivity-offline-first).
 *
 * Proves `useMuseumPrefetch` gates only on `(info.type as string) !== 'wifi'`
 * (useMuseumPrefetch.ts:41) and IGNORES `isInternetReachable` — so a captive
 * portal on wifi (`{type:'wifi', isInternetReachable:false}`) still triggers a
 * prefetch over dead connectivity (TD-NI-02).
 *
 * Spec R7, design §2. Target: skip prefetch unless the canonical predicate
 * `isOnline({isConnected, isInternetReachable})` is true (i.e. require
 * `isInternetReachable !== false`), in addition to the existing low-data/wifi
 * metered guard.
 *
 * lib-docs cited: @react-native-community/netinfo PATTERNS.md:173,266 (don't
 * trust isConnected/wifi alone — TD-NI-02); @tanstack/react-query
 * PATTERNS.md:263 (this is the custom-Map prefetch, not prefetchQuery — kept).
 *
 * RED contract: the captive-portal case FAILS before T2.2 because the current
 * code prefetches on wifi regardless of reachability.
 *
 * Test-mock discipline: official-NetInfo-shaped `fetch` mock + per-test
 * `mockResolvedValue` (spec §4 / netinfo PATTERNS.md:235). No inline entities.
 */
import { renderHook, waitFor } from '@testing-library/react-native';

// ── Mocks ────────────────────────────────────────────────────────────────────
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

// ── Helpers ──────────────────────────────────────────────────────────────────
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
    // Give the resolved fetch promise a chance to run the gate.
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
