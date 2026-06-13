/**
 * RED — C-R1 (cluster cost-consumers, run undefined-network-detection-reliability).
 *
 * CONTRACT CHANGE (spec §10 invalidated #9, design §2.5): the prefetch gate is
 * now the pure COST axis. The old gate `(info.type !== 'wifi' && isLowData)`
 * mixed QUALITY into a COST decision (INV-02) and missed Android metered wifi
 * (US-02.6). New contract:
 *   - existing isOnline gate UNCHANGED (covered by useMuseumPrefetch.reachability.test.ts);
 *   - skip when preference === 'low' (US-08.1);
 *   - skip when preference !== 'normal' AND the fresh NetInfo.fetch snapshot is
 *     metered (`deriveMetered({ details: info.details })`) — US-02.2; an explicit
 *     'normal' preference bypasses the cost gate (US-08.2);
 *   - the QUALITY axis (resolved/isLowData) no longer gates prefetch (INV-02).
 *
 * `deriveMetered` stays REAL (jest.requireActual) so the gate is exercised
 * against the genuine cost derivation (US-02.5 null-safety included).
 */
import { renderHook, waitFor } from '@testing-library/react-native';

import { makeNetInfoSnapshot } from '@/__tests__/helpers/factories/connectivity.factories';

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

/**
 * Mutable data-mode context the hook reads. `resolved`/`isLowData` are kept in
 * the mock so the tests can PROVE the quality axis no longer gates (INV-02).
 * `deriveMetered` is the real export (requireActual spread).
 */
const mockDataModeContext = {
  preference: 'auto' as 'auto' | 'low' | 'normal',
  resolved: 'normal' as 'low' | 'normal',
  metered: false,
  setPreference: () => undefined,
};
jest.mock('@/features/chat/application/DataModeProvider', () => ({
  ...jest.requireActual('@/features/chat/application/DataModeProvider'),
  useDataMode: () => ({
    ...mockDataModeContext,
    isLowData: mockDataModeContext.resolved === 'low',
  }),
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

function setDataMode(overrides: Partial<typeof mockDataModeContext>): void {
  Object.assign(mockDataModeContext, overrides);
}

/** Lets the resolved NetInfo.fetch promise run the gate before asserting a skip. */
const flushGate = async (): Promise<void> => {
  await waitFor(() => {
    expect(mockNetInfoFetch).toHaveBeenCalled();
  });
  await new Promise((r) => setTimeout(r, 50));
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useMuseumPrefetch — cost-axis gate (INV-02, US-02.2/02.6, US-08.1/08.2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _resetPrefetchTimestamps();
    setDataMode({ preference: 'auto', resolved: 'normal', metered: false });
    mockNetInfoFetch.mockResolvedValue(makeNetInfoSnapshot({ type: 'wifi' }));
    mockFetchLowDataPack.mockResolvedValue(makeLowDataPack());
  });

  it('prefetches on non-metered wifi in auto preference (happy path)', async () => {
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
    expect(storedEntries[0]?.question).toBe('Who painted the Mona Lisa?');
    expect(storedEntries[0]?.museumId).toBe('louvre');
    expect(storedEntries[0]?.source).toBe('prefetch');
  });

  // INV-02 / US-02.2 — metered cellular skips, regardless of the quality axis.
  it('skips prefetch on metered cellular in auto preference (cost axis)', async () => {
    setDataMode({ preference: 'auto', resolved: 'normal' });
    mockNetInfoFetch.mockResolvedValue(
      makeNetInfoSnapshot({ type: 'cellular', isConnectionExpensive: true }),
    );

    renderHook(() => {
      useMuseumPrefetch('louvre', 'en');
    });

    await flushGate();

    expect(mockFetchLowDataPack).not.toHaveBeenCalled();
    expect(mockBulkStore).not.toHaveBeenCalled();
  });

  // INV-02 / US-02.6 — Android metered wifi (hotspot): type is no longer consulted.
  it('skips prefetch on metered WIFI (Android hotspot) in auto preference', async () => {
    setDataMode({ preference: 'auto', resolved: 'normal' });
    mockNetInfoFetch.mockResolvedValue(
      makeNetInfoSnapshot({ type: 'wifi', isConnectionExpensive: true }),
    );

    renderHook(() => {
      useMuseumPrefetch('louvre', 'en');
    });

    await flushGate();

    expect(mockFetchLowDataPack).not.toHaveBeenCalled();
    expect(mockBulkStore).not.toHaveBeenCalled();
  });

  // INV-02 — the QUALITY axis must NOT gate the prefetch any more: a user whose
  // measured network is slow (resolved 'low') on a NON-metered cellular keeps
  // the pack precisely when it is most useful (design §2.5 rejected alternative).
  it('allows prefetch on non-metered cellular even when resolved is low (quality does not gate)', async () => {
    setDataMode({ preference: 'auto', resolved: 'low' });
    mockNetInfoFetch.mockResolvedValue(
      makeNetInfoSnapshot({ type: 'cellular', isConnectionExpensive: false }),
    );

    renderHook(() => {
      useMuseumPrefetch('louvre', 'en');
    });

    await waitFor(() => {
      expect(mockFetchLowDataPack).toHaveBeenCalledWith('louvre', 'en');
    });
    expect(mockBulkStore).toHaveBeenCalledTimes(1);
  });

  // INV-03 / US-08.2 — explicit 'normal' preference bypasses the metered gate.
  it("preference 'normal' bypasses the metered gate (prefetch on metered cellular)", async () => {
    setDataMode({ preference: 'normal', resolved: 'normal' });
    mockNetInfoFetch.mockResolvedValue(
      makeNetInfoSnapshot({ type: 'cellular', isConnectionExpensive: true }),
    );

    renderHook(() => {
      useMuseumPrefetch('louvre', 'en');
    });

    await waitFor(() => {
      expect(mockFetchLowDataPack).toHaveBeenCalledWith('louvre', 'en');
    });
    expect(mockBulkStore).toHaveBeenCalledTimes(1);
  });

  // INV-03 / US-08.1 — explicit 'low' preference always skips, even non-metered wifi.
  it("preference 'low' skips prefetch even on non-metered wifi", async () => {
    setDataMode({ preference: 'low', resolved: 'low' });
    mockNetInfoFetch.mockResolvedValue(
      makeNetInfoSnapshot({ type: 'wifi', isConnectionExpensive: false }),
    );

    renderHook(() => {
      useMuseumPrefetch('louvre', 'en');
    });

    await flushGate();

    expect(mockFetchLowDataPack).not.toHaveBeenCalled();
    expect(mockBulkStore).not.toHaveBeenCalled();
  });

  // US-02.5 — details:null (cold-start blank state) derives metered=false ⇒ prefetch.
  it('treats details:null (cold-start) as non-metered and prefetches', async () => {
    setDataMode({ preference: 'auto', resolved: 'normal' });
    mockNetInfoFetch.mockResolvedValue(makeNetInfoSnapshot({ type: 'wifi', details: null }));

    renderHook(() => {
      useMuseumPrefetch('louvre', 'en');
    });

    await waitFor(() => {
      expect(mockFetchLowDataPack).toHaveBeenCalledWith('louvre', 'en');
    });
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
    mockNetInfoFetch.mockResolvedValue(makeNetInfoSnapshot({ type: 'wifi' }));
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
    expect(typeof storedEntries[0]?.cachedAt).toBe('number');
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
