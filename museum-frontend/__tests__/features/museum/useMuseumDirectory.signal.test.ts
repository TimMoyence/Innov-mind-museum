/**
 * Tests for TD-TQ-01 — `useMuseumDirectory` MUST thread the
 * `QueryFunctionContext.signal` through to both `museumApi.searchMuseums()`
 * (geo + text search) and `museumApi.listMuseumDirectory()` (geo fallback).
 *
 * Spec R2/R3/R4 + design D1/D6 mandate:
 *  - geo path: `museumApi.searchMuseums(params, { signal })` receives a live
 *    AbortSignal as its 2nd arg.
 *  - geo fallback: when the search call rejects, `museumApi.listMuseumDirectory({ signal })`
 *    receives a live AbortSignal.
 *  - text-search path: `searchQueryResult.queryFn` forwards signal to the
 *    search API.
 *  - queryKey flip (R3): when coords cross the rounding boundary mid-fetch,
 *    the in-flight signal aborts before the prior resolution can clobber the
 *    new cache entry.
 *
 * lib-docs cite: lib-docs/@tanstack/react-query/PATTERNS.md:295 (signal canonical)
 * + PATTERNS.md:175 (queryKey dependency requirement).
 *
 * RED contract: the current source declares `queryFn: async () => {...}` (no
 * ctx) so `museumApi.searchMuseums` and `museumApi.listMuseumDirectory` are
 * called with one positional arg (or none) — no `{ signal }` 2nd arg can be
 * observed. All assertions on captured-signal presence fail.
 */
import '@/__tests__/helpers/test-utils';
import { act, waitFor } from '@testing-library/react-native';

import { renderHookWithQueryClient } from '@/__tests__/helpers/data/renderWithQueryClient';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockSearchMuseums = jest.fn();
const mockListMuseumDirectory = jest.fn();

jest.mock('@/features/museum/infrastructure/museumApi', () => ({
  museumApi: {
    searchMuseums: (...args: unknown[]) => mockSearchMuseums(...args),
    listMuseumDirectory: (...args: unknown[]) => mockListMuseumDirectory(...args),
  },
}));

import { useMuseumDirectory } from '@/features/museum/application/useMuseumDirectory';

// ── Helpers ──────────────────────────────────────────────────────────────────

const emptySearchResponse = { museums: [], count: 0 };

/** Pick the 2nd-arg options object from a captured mock call (the design's `{ signal }` shape). */
const extractSignalOpt = (call: unknown[] | undefined): { signal?: unknown } | undefined => {
  if (!call) return undefined;
  // searchMuseums(params, opts?) — opts is index 1.
  // listMuseumDirectory(opts?) — opts is index 0.
  // We probe both indices and return the first object that carries a `signal`.
  for (const candidate of call) {
    if (
      candidate &&
      typeof candidate === 'object' &&
      'signal' in (candidate as Record<string, unknown>)
    ) {
      return candidate as { signal?: unknown };
    }
  }
  return undefined;
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useMuseumDirectory — TD-TQ-01 signal propagation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchMuseums.mockResolvedValue(emptySearchResponse);
    mockListMuseumDirectory.mockResolvedValue([]);
  });

  it('forwards an AbortSignal to museumApi.searchMuseums on the geo path', async () => {
    renderHookWithQueryClient(() => useMuseumDirectory(48.86, 2.35));

    await waitFor(() => {
      expect(mockSearchMuseums).toHaveBeenCalledTimes(1);
    });

    const opts = extractSignalOpt(mockSearchMuseums.mock.calls[0]);
    expect(opts).toBeDefined();
    expect(opts?.signal).toBeInstanceOf(AbortSignal);
  });

  it('forwards an AbortSignal to museumApi.listMuseumDirectory on the geo fallback path', async () => {
    mockSearchMuseums.mockRejectedValueOnce(new Error('search degraded'));

    renderHookWithQueryClient(() => useMuseumDirectory(48.86, 2.35));

    await waitFor(() => {
      expect(mockListMuseumDirectory).toHaveBeenCalledTimes(1);
    });

    const opts = extractSignalOpt(mockListMuseumDirectory.mock.calls[0]);
    expect(opts).toBeDefined();
    expect(opts?.signal).toBeInstanceOf(AbortSignal);
  });

  it('forwards an AbortSignal to museumApi.listMuseumDirectory when no coords available', async () => {
    renderHookWithQueryClient(() => useMuseumDirectory(null, null));

    await waitFor(() => {
      expect(mockListMuseumDirectory).toHaveBeenCalledTimes(1);
    });

    const opts = extractSignalOpt(mockListMuseumDirectory.mock.calls[0]);
    expect(opts).toBeDefined();
    expect(opts?.signal).toBeInstanceOf(AbortSignal);
  });

  it('forwards an AbortSignal to museumApi.searchMuseums on the text-search path', async () => {
    const { result } = renderHookWithQueryClient(() => useMuseumDirectory(48.86, 2.35));

    // Wait for the initial geo call to land.
    await waitFor(() => {
      expect(mockSearchMuseums).toHaveBeenCalledTimes(1);
    });

    act(() => {
      result.current.setSearchQuery('louvre');
    });

    // Wait through the 500ms debounce + the next call.
    await waitFor(
      () => {
        expect(mockSearchMuseums.mock.calls.length).toBeGreaterThanOrEqual(2);
      },
      { timeout: 2000 },
    );

    const lastCall = mockSearchMuseums.mock.calls[mockSearchMuseums.mock.calls.length - 1];
    const opts = extractSignalOpt(lastCall);
    expect(opts).toBeDefined();
    expect(opts?.signal).toBeInstanceOf(AbortSignal);
  });

  it('aborts the in-flight signal when the queryKey flips (R3 GPS jitter clobber prevention)', async () => {
    // Deferred fetch A — never resolves until we explicitly do so.
    let resolveA: (value: typeof emptySearchResponse) => void = () => undefined;
    mockSearchMuseums.mockImplementationOnce(
      () =>
        new Promise<typeof emptySearchResponse>((resolve) => {
          resolveA = resolve;
        }),
    );

    const { rerender } = renderHookWithQueryClient(
      ({ lat, lng }: { lat: number; lng: number }) => useMuseumDirectory(lat, lng),
      { initialProps: { lat: 48.86, lng: 2.35 } },
    );

    await waitFor(() => {
      expect(mockSearchMuseums).toHaveBeenCalledTimes(1);
    });
    const optsA = extractSignalOpt(mockSearchMuseums.mock.calls[0]);
    expect(optsA?.signal).toBeInstanceOf(AbortSignal);
    expect((optsA?.signal as AbortSignal | undefined)?.aborted).toBe(false);

    // Bump coords past the 2-decimal rounding boundary → new queryKey → new fetch.
    mockSearchMuseums.mockResolvedValueOnce(emptySearchResponse);
    rerender({ lat: 48.88, lng: 2.37 });

    await waitFor(() => {
      expect(mockSearchMuseums.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    // Signal A must abort before we resolve it (otherwise its resolution could
    // clobber fetch B's cache write).
    await waitFor(() => {
      expect((optsA?.signal as AbortSignal | undefined)?.aborted).toBe(true);
    });

    // Resolve A late — the abort already happened.
    resolveA(emptySearchResponse);
  });
});
