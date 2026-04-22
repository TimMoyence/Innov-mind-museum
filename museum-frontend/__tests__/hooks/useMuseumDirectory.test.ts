import '@/__tests__/helpers/test-utils';
import { act, waitFor } from '@testing-library/react-native';
import { useMuseumDirectory } from '@/features/museum/application/useMuseumDirectory';
import { makeMuseumListItem, makeGeoLocation } from '@/__tests__/helpers/factories';
import { renderHookWithQueryClient } from '@/__tests__/helpers/data/renderWithQueryClient';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockListMuseumDirectory = jest.fn();
const mockSearchMuseums = jest.fn();

jest.mock('@/features/museum/infrastructure/museumApi', () => ({
  museumApi: {
    listMuseumDirectory: () => mockListMuseumDirectory(),
    searchMuseums: (params: unknown) => mockSearchMuseums(params),
  },
}));

// ── Tests ────────────────────────────────────────────────────────────────────

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
          distance: 500, // meters — backend contract
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

    // Without coordinates, distance is null; should sort alphabetically
    expect(result.current.museums[0].name).toBe('Louvre');
    expect(result.current.museums[1].name).toBe('Musee d Orsay');
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

    // Client-side filter is immediate (no debounce for display)
    expect(result.current.museums.length).toBe(1);
    expect(result.current.museums[0].name).toBe('Louvre');
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
    expect(result.current.museums[0].name).toBe('Musee d Orsay');
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

    // Re-render with significantly different coordinates — rounded key flips
    // from [48.86, 2.35] to [49.0, 3.0] so react-query issues a fresh fetch.
    rerender({ lat: 49.0, lng: 3.0 });

    await waitFor(() => {
      expect(mockSearchMuseums.mock.calls.length).toBeGreaterThan(callCountAfterFirst);
    });
  });

  // ── Distance threshold (rounded-key GPS jitter suppression) ─────────────────

  it('skips re-fetch when coordinates round to the same 2-decimal key', async () => {
    const { result, rerender } = renderHookWithQueryClient(
      ({ lat, lng }: { lat: number | null; lng: number | null }) => useMuseumDirectory(lat, lng),
      { initialProps: { lat: 48.8566 as number | null, lng: 2.3522 as number | null } },
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const callCountAfterFirst = mockSearchMuseums.mock.calls.length;

    // Tiny GPS jitter — both coord sets round to [48.86, 2.35] so react-query
    // reuses the cached result and does NOT fire a new network request.
    rerender({ lat: 48.8576, lng: 2.3532 });

    // Wait a tick to let any potential effect fire
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

    // Initial mount without coordinates uses directory endpoint
    expect(mockListMuseumDirectory).toHaveBeenCalledTimes(1);
    expect(mockSearchMuseums).not.toHaveBeenCalled();

    // GPS fix arrives — should trigger search endpoint (first coordinates, no prior ref)
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
});
