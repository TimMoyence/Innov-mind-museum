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
      { question: 'When was the Louvre built?', answer: '1793', source: 'seeded' },
    ],
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useMuseumPrefetch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _resetPrefetchTimestamps();
    mockIsLowData = false;
    mockNetInfoFetch.mockResolvedValue({ type: 'wifi' });
    mockFetchLowDataPack.mockResolvedValue(makeLowDataPack());
  });

  it('prefetches on museum change when on wifi', async () => {
    renderHook(() => {
      useMuseumPrefetch('louvre', 'en');
    });

    await waitFor(() => {
      expect(mockFetchLowDataPack).toHaveBeenCalledWith('louvre', 'en');
    });

    expect(mockBulkStore).toHaveBeenCalledTimes(1);
    const storedEntries = mockBulkStore.mock.calls[0][0] as {
      question: string;
      answer: string;
      museumId: string;
      locale: string;
      source: string;
    }[];
    expect(storedEntries).toHaveLength(2);
    expect(storedEntries[0].question).toBe('Who painted the Mona Lisa?');
    expect(storedEntries[0].museumId).toBe('louvre');
    expect(storedEntries[0].source).toBe('prefetch');
  });

  it('skips prefetch on cellular when low-data mode is active', async () => {
    mockIsLowData = true;
    mockNetInfoFetch.mockResolvedValue({ type: 'cellular' });

    renderHook(() => {
      useMuseumPrefetch('louvre', 'en');
    });

    // Wait for the NetInfo.fetch promise to resolve
    await waitFor(() => {
      expect(mockNetInfoFetch).toHaveBeenCalled();
    });

    expect(mockFetchLowDataPack).not.toHaveBeenCalled();
    expect(mockBulkStore).not.toHaveBeenCalled();
  });

  it('allows prefetch on cellular when NOT in low-data mode', async () => {
    mockIsLowData = false;
    mockNetInfoFetch.mockResolvedValue({ type: 'cellular' });

    renderHook(() => {
      useMuseumPrefetch('louvre', 'en');
    });

    await waitFor(() => {
      expect(mockFetchLowDataPack).toHaveBeenCalledWith('louvre', 'en');
    });

    expect(mockBulkStore).toHaveBeenCalledTimes(1);
  });

  it('skips prefetch when cooldown has not expired', async () => {
    // First render: should prefetch
    const { unmount } = renderHook(() => {
      useMuseumPrefetch('louvre', 'en');
    });

    await waitFor(() => {
      expect(mockFetchLowDataPack).toHaveBeenCalledTimes(1);
    });

    unmount();
    jest.clearAllMocks();
    mockNetInfoFetch.mockResolvedValue({ type: 'wifi' });
    mockFetchLowDataPack.mockResolvedValue(makeLowDataPack());

    // Second render: same museum + locale, cooldown should block
    renderHook(() => {
      useMuseumPrefetch('louvre', 'en');
    });

    // Give the effect time to run (it should short-circuit before NetInfo.fetch)
    await new Promise((r) => setTimeout(r, 50));

    expect(mockFetchLowDataPack).not.toHaveBeenCalled();
  });

  it('stores entries via bulkStore with correct shape', async () => {
    const pack = makeLowDataPack({
      entries: [
        {
          question: 'Test Q',
          answer: 'Test A',
          metadata: { artworkId: 42 },
          source: 'cache',
        },
      ],
    });
    mockFetchLowDataPack.mockResolvedValue(pack);

    renderHook(() => {
      useMuseumPrefetch('orsay', 'fr');
    });

    await waitFor(() => {
      expect(mockBulkStore).toHaveBeenCalledTimes(1);
    });

    const storedEntries = mockBulkStore.mock.calls[0][0] as {
      question: string;
      answer: string;
      metadata: Record<string, unknown>;
      museumId: string;
      locale: string;
      cachedAt: number;
      source: string;
    }[];
    expect(storedEntries).toHaveLength(1);
    expect(storedEntries[0]).toEqual(
      expect.objectContaining({
        question: 'Test Q',
        answer: 'Test A',
        metadata: { artworkId: 42 },
        museumId: 'orsay',
        locale: 'fr',
        source: 'prefetch',
      }),
    );
    expect(typeof storedEntries[0].cachedAt).toBe('number');
  });

  it('does nothing when museumId is null', async () => {
    renderHook(() => {
      useMuseumPrefetch(null, 'en');
    });

    await new Promise((r) => setTimeout(r, 50));

    expect(mockNetInfoFetch).not.toHaveBeenCalled();
    expect(mockFetchLowDataPack).not.toHaveBeenCalled();
  });

  it('fail-open: does not throw on fetch error', async () => {
    mockFetchLowDataPack.mockRejectedValue(new Error('Network error'));

    renderHook(() => {
      useMuseumPrefetch('louvre', 'en');
    });

    await waitFor(() => {
      expect(mockFetchLowDataPack).toHaveBeenCalled();
    });

    // Should not throw — bulkStore should not be called
    expect(mockBulkStore).not.toHaveBeenCalled();
  });
});
