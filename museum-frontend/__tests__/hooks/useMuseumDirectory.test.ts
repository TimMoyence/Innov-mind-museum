import '@/__tests__/helpers/test-utils';
import { act, waitFor } from '@testing-library/react-native';
import { useMuseumDirectory } from '@/features/museum/application/useMuseumDirectory';
import { makeMuseumListItem, makeGeoLocation } from '@/__tests__/helpers/factories';
import { renderHookWithQueryClient } from '@/__tests__/helpers/data/renderWithQueryClient';

const mockListMuseumDirectory = jest.fn();
const mockSearchMuseums = jest.fn();

jest.mock('@/features/museum/infrastructure/museumApi', () => ({
  museumApi: {
    listMuseumDirectory: () => mockListMuseumDirectory(),
    searchMuseums: (params: unknown) => mockSearchMuseums(params),
  },
}));

describe('useMuseumDirectory', () => {
  const louvre = makeMuseumListItem({
    id: 1,
    name: 'Louvre',
    address: '75001 Paris',
    latitude: 48.8606,
    longitude: 2.3376,
  });

  const orsay = makeMuseumListItem({
    id: 2,
    name: 'Musee d Orsay',
    address: '75007 Paris',
    latitude: 48.86,
    longitude: 2.3266,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockListMuseumDirectory.mockResolvedValue([louvre, orsay]);
    mockSearchMuseums.mockResolvedValue({
      museums: [
        {
          name: 'Louvre',
          address: '75001 Paris',
          latitude: 48.8606,
          longitude: 2.3376,
          distance: 500,
          source: 'local' as const,
          museumType: 'general' as const,
        },
      ],
      count: 1,
    });
  });

  it('fetches museum directory on mount without coordinates', async () => {
    const { result } = renderHookWithQueryClient(() => useMuseumDirectory(null, null));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockListMuseumDirectory).toHaveBeenCalledTimes(1);
    expect(result.current.museums.length).toBe(2);
  });

  it('sorts museums alphabetically when no distance is available', async () => {
    mockListMuseumDirectory.mockResolvedValue([orsay, louvre]);

    const { result } = renderHookWithQueryClient(() => useMuseumDirectory(null, null));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.museums[0]?.name).toBe('Louvre');
    expect(result.current.museums[1]?.name).toBe('Musee d Orsay');
  });

  it('uses search endpoint when coordinates are provided', async () => {
    const userLocation = makeGeoLocation({ latitude: 48.8566, longitude: 2.3522 });

    const { result } = renderHookWithQueryClient(() =>
      useMuseumDirectory(userLocation.latitude, userLocation.longitude),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockSearchMuseums).toHaveBeenCalledWith(
      expect.objectContaining({
        lat: userLocation.latitude,
        lng: userLocation.longitude,
        radius: 3_000,
      }),
    );
  });

  it('falls back to directory endpoint when search fails', async () => {
    mockSearchMuseums.mockRejectedValue(new Error('Search unavailable'));
    const userLocation = makeGeoLocation({ latitude: 48.8566, longitude: 2.3522 });

    const { result } = renderHookWithQueryClient(() =>
      useMuseumDirectory(userLocation.latitude, userLocation.longitude),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockListMuseumDirectory).toHaveBeenCalled();
    expect(result.current.museums.length).toBeGreaterThan(0);
  });

  it('filters museums by name via client-side search', async () => {
    const { result } = renderHookWithQueryClient(() => useMuseumDirectory(null, null));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.setSearchQuery('Louvre');
    });

    expect(result.current.museums.length).toBe(1);
    expect(result.current.museums[0]?.name).toBe('Louvre');
  });

  it('filters museums by address', async () => {
    const { result } = renderHookWithQueryClient(() => useMuseumDirectory(null, null));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.setSearchQuery('75007');
    });

    expect(result.current.museums.length).toBe(1);
    expect(result.current.museums[0]?.name).toBe('Musee d Orsay');
  });

  it('returns empty list when fetch fails completely', async () => {
    mockListMuseumDirectory.mockRejectedValue(new Error('Network error'));

    const { result } = renderHookWithQueryClient(() => useMuseumDirectory(null, null));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.museums).toEqual([]);
  });

  it('re-fetches when coordinates change significantly', async () => {
    const { result, rerender } = renderHookWithQueryClient(
      ({ lat, lng }: { lat: number | null; lng: number | null }) => useMuseumDirectory(lat, lng),
      { initialProps: { lat: 48.8566 as number | null, lng: 2.3522 as number | null } },
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const callCountAfterFirst = mockSearchMuseums.mock.calls.length;

    rerender({ lat: 49.0, lng: 3.0 });

    await waitFor(() => {
      expect(mockSearchMuseums.mock.calls.length).toBeGreaterThan(callCountAfterFirst);
    });
  });

  it('skips re-fetch when coordinates round to the same 2-decimal key', async () => {
    const { result, rerender } = renderHookWithQueryClient(
      ({ lat, lng }: { lat: number | null; lng: number | null }) => useMuseumDirectory(lat, lng),
      { initialProps: { lat: 48.8566 as number | null, lng: 2.3522 as number | null } },
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const callCountAfterFirst = mockSearchMuseums.mock.calls.length;

    rerender({ lat: 48.8576, lng: 2.3532 });

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockSearchMuseums.mock.calls.length).toBe(callCountAfterFirst);
  });

  it('fetches when transitioning from null coordinates to valid coordinates', async () => {
    const { result, rerender } = renderHookWithQueryClient(
      ({ lat, lng }: { lat: number | null; lng: number | null }) => useMuseumDirectory(lat, lng),
      { initialProps: { lat: null as number | null, lng: null as number | null } },
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockListMuseumDirectory).toHaveBeenCalledTimes(1);
    expect(mockSearchMuseums).not.toHaveBeenCalled();

    rerender({ lat: 48.8566, lng: 2.3522 });

    await waitFor(() => {
      expect(mockSearchMuseums).toHaveBeenCalledTimes(1);
    });

    expect(mockSearchMuseums).toHaveBeenCalledWith(
      expect.objectContaining({ lat: 48.8566, lng: 2.3522, radius: 3_000 }),
    );
  });

  it('provides a refresh function that re-fetches data', async () => {
    const { result } = renderHookWithQueryClient(() => useMuseumDirectory(null, null));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const initialCallCount = mockListMuseumDirectory.mock.calls.length;

    act(() => {
      result.current.refresh();
    });

    await waitFor(() => {
      expect(mockListMuseumDirectory.mock.calls.length).toBeGreaterThan(initialCallCount);
    });
  });

  describe('react-query integration guards', () => {
    it('does NOT call searchMuseums when coords are null and searchQuery is empty', async () => {
      const { result } = renderHookWithQueryClient(() => useMuseumDirectory(null, null));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockListMuseumDirectory).toHaveBeenCalledTimes(1);
      expect(mockSearchMuseums).not.toHaveBeenCalled();
    });

    it('searchInBounds fetches bbox but does not pollute the near-coords cache', async () => {
      mockSearchMuseums.mockResolvedValue({
        museums: [
          {
            name: 'Louvre',
            address: '75001 Paris',
            latitude: 48.8606,
            longitude: 2.3376,
            distance: 500,
            source: 'local' as const,
            museumType: 'general' as const,
          },
        ],
        count: 1,
      });

      const { result, client } = renderHookWithQueryClient(() =>
        useMuseumDirectory(48.8566, 2.3522),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const nearKey = ['museums', 'near', 48.86, 2.35] as const;
      const snapshot = client.getQueryData(nearKey);
      expect(snapshot).toBeDefined();

      const bbox: [number, number, number, number] = [2.0, 48.0, 3.0, 49.0];
      mockSearchMuseums.mockClear();
      mockSearchMuseums.mockResolvedValue({
        museums: [
          {
            name: 'Versailles',
            address: '78000 Versailles',
            latitude: 48.805,
            longitude: 2.1204,
            distance: 20_000,
            source: 'osm' as const,
            museumType: 'art' as const,
          },
        ],
        count: 1,
      });

      await act(async () => {
        result.current.searchInBounds(bbox);
        await Promise.resolve();
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(result.current.museums.length).toBeGreaterThan(0);
      });

      expect(mockSearchMuseums).toHaveBeenCalledWith({ bbox });
      expect(client.getQueryData(nearKey)).toBe(snapshot);
      expect(result.current.museums[0]?.name).toBe('Versailles');
    });

    it('text search gating: does NOT call searchMuseums with q when searchQuery is below 2 chars', async () => {
      jest.useFakeTimers();
      try {
        const { result } = renderHookWithQueryClient(() => useMuseumDirectory(null, null));

        await act(async () => {
          await Promise.resolve();
        });

        const baselineSearchCalls = mockSearchMuseums.mock.calls.length;

        act(() => {
          result.current.setSearchQuery('a');
        });

        await act(async () => {
          jest.advanceTimersByTime(1000);
          await Promise.resolve();
        });

        expect(mockSearchMuseums.mock.calls.length).toBe(baselineSearchCalls);
      } finally {
        jest.useRealTimers();
      }
    });

    it('text search debounces: a 500 ms idle gap is required before the API call fires', async () => {
      jest.useFakeTimers();
      try {
        const userLat = 48.8566;
        const userLng = 2.3522;

        const { result } = renderHookWithQueryClient(() => useMuseumDirectory(userLat, userLng));

        await act(async () => {
          await Promise.resolve();
          await Promise.resolve();
        });
        const beforeDebounce = mockSearchMuseums.mock.calls.length;

        act(() => {
          result.current.setSearchQuery('Louvre');
        });

        await act(async () => {
          jest.advanceTimersByTime(499);
          await Promise.resolve();
        });
        expect(mockSearchMuseums.mock.calls.length).toBe(beforeDebounce);

        await act(async () => {
          jest.advanceTimersByTime(2);
          await Promise.resolve();
          await Promise.resolve();
        });

        await waitFor(() => {
          expect(mockSearchMuseums.mock.calls.length).toBeGreaterThan(beforeDebounce);
        });

        const lastCall = mockSearchMuseums.mock.calls[mockSearchMuseums.mock.calls.length - 1][0];
        expect(lastCall).toEqual(
          expect.objectContaining({ q: 'Louvre', lat: userLat, lng: userLng, radius: 3_000 }),
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('text search collapses: backspacing below 2 chars drops the search query and stops firing q-searches', async () => {
      jest.useFakeTimers();
      try {
        const { result } = renderHookWithQueryClient(() => useMuseumDirectory(48.8566, 2.3522));

        await act(async () => {
          await Promise.resolve();
          await Promise.resolve();
        });

        act(() => {
          result.current.setSearchQuery('Lou');
        });
        await act(async () => {
          jest.advanceTimersByTime(500);
          await Promise.resolve();
          await Promise.resolve();
        });

        await waitFor(() => {
          expect(
            mockSearchMuseums.mock.calls.some((c) => (c[0] as { q?: string }).q === 'Lou'),
          ).toBe(true);
        });

        const afterFirstSearch = mockSearchMuseums.mock.calls.length;

        act(() => {
          result.current.setSearchQuery('L');
        });
        await act(async () => {
          jest.advanceTimersByTime(500);
          await Promise.resolve();
        });

        const newQCalls = mockSearchMuseums.mock.calls
          .slice(afterFirstSearch)
          .filter((c) => (c[0] as { q?: string }).q === 'L');
        expect(newQCalls).toHaveLength(0);
      } finally {
        jest.useRealTimers();
      }
    });

    it('refresh() resets bbox override and returns to near-coords results', async () => {
      const { result } = renderHookWithQueryClient(() => useMuseumDirectory(48.8566, 2.3522));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.museums[0]?.name).toBe('Louvre');

      mockSearchMuseums.mockResolvedValue({
        museums: [
          {
            name: 'Versailles',
            address: '78000 Versailles',
            latitude: 48.805,
            longitude: 2.1204,
            distance: 20_000,
            source: 'osm' as const,
            museumType: 'art' as const,
          },
        ],
        count: 1,
      });

      await act(async () => {
        result.current.searchInBounds([2.0, 48.0, 3.0, 49.0]);
        await Promise.resolve();
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(result.current.museums[0]?.name).toBe('Versailles');
      });

      mockSearchMuseums.mockResolvedValue({
        museums: [
          {
            name: 'Louvre',
            address: '75001 Paris',
            latitude: 48.8606,
            longitude: 2.3376,
            distance: 500,
            source: 'local' as const,
            museumType: 'general' as const,
          },
        ],
        count: 1,
      });

      act(() => {
        result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.museums[0]?.name).toBe('Louvre');
      });
    });
  });
});
