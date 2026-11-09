import '@/__tests__/helpers/test-utils';
import { act, waitFor } from '@testing-library/react-native';

import { renderHookWithQueryClient } from '@/__tests__/helpers/data/renderWithQueryClient';

const mockSearchMuseums = jest.fn();
const mockListMuseumDirectory = jest.fn();

jest.mock('@/features/museum/infrastructure/museumApi', () => ({
  museumApi: {
    searchMuseums: (...args: unknown[]) => mockSearchMuseums(...args),
    listMuseumDirectory: (...args: unknown[]) => mockListMuseumDirectory(...args),
  },
}));

import { useMuseumDirectory } from '@/features/museum/application/useMuseumDirectory';

const emptySearchResponse = { museums: [], count: 0 };

const extractSignalOpt = (call: unknown[] | undefined): { signal?: unknown } | undefined => {
  if (!call) return undefined;
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

    await waitFor(() => {
      expect(mockSearchMuseums).toHaveBeenCalledTimes(1);
    });

    act(() => {
      result.current.setSearchQuery('louvre');
    });

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

    mockSearchMuseums.mockResolvedValueOnce(emptySearchResponse);
    rerender({ lat: 48.88, lng: 2.37 });

    await waitFor(() => {
      expect(mockSearchMuseums.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    await waitFor(() => {
      expect((optsA?.signal as AbortSignal | undefined)?.aborted).toBe(true);
    });

    resolveA(emptySearchResponse);
  });
});
