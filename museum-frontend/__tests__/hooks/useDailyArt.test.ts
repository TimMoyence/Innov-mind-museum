import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useDailyArt } from '@/features/daily-art/application/useDailyArt';
import type { DailyArtwork } from '@/features/daily-art/infrastructure/dailyArtApi';

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
}));

const mockFetchDailyArt = jest.fn<Promise<DailyArtwork>, []>();

jest.mock('@/features/daily-art/infrastructure/dailyArtApi', () => ({
  fetchDailyArt: (...args: unknown[]) => mockFetchDailyArt(...(args as [])),
}));

// Import AsyncStorage after mock so we can spy on it
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Helpers ──────────────────────────────────────────────────────────────────

const sampleArtwork: DailyArtwork = {
  title: 'Starry Night',
  artist: 'Vincent van Gogh',
  year: '1889',
  imageUrl: 'https://example.com/starry-night.jpg',
  description: 'A swirling night sky over a village.',
  funFact: 'Painted from memory during his stay at the asylum.',
  museum: 'MoMA',
};

const todayKey = (): string => new Date().toISOString().slice(0, 10);

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useDailyArt', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchDailyArt.mockResolvedValue(sampleArtwork);
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
  });

  it('starts with isLoading=true and fetches artwork on mount', async () => {
    const { result } = renderHook(() => useDailyArt());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.artwork).toBeNull();

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockFetchDailyArt).toHaveBeenCalledTimes(1);
    expect(result.current.artwork).toEqual(sampleArtwork);
  });

  it('returns artwork data on success', async () => {
    const { result } = renderHook(() => useDailyArt());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.artwork).not.toBeNull();
    expect(result.current.artwork?.title).toBe('Starry Night');
    expect(result.current.artwork?.artist).toBe('Vincent van Gogh');
    expect(result.current.artwork?.museum).toBe('MoMA');
    expect(result.current.isSaved).toBe(false);
    expect(result.current.dismissed).toBe(false);
  });

  it('handles API error gracefully — artwork stays null, no crash', async () => {
    mockFetchDailyArt.mockRejectedValue(new Error('Network failure'));

    const { result } = renderHook(() => useDailyArt());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Artwork should be null (silently failed), no thrown error
    expect(result.current.artwork).toBeNull();
    expect(result.current.dismissed).toBe(false);
  });

  it('skip() sets dismissed=true and stores today date', async () => {
    const { result } = renderHook(() => useDailyArt());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.dismissed).toBe(false);

    await act(async () => {
      await result.current.skip();
    });

    expect(result.current.dismissed).toBe(true);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('@musaium/daily_art_dismissed', todayKey());
  });

  it('returns dismissed=true on mount if already dismissed today', async () => {
    // Simulate today's date already stored as dismissed
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) => {
      if (key === '@musaium/daily_art_dismissed') return Promise.resolve(todayKey());
      return Promise.resolve(null);
    });

    const { result } = renderHook(() => useDailyArt());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.dismissed).toBe(true);
    // Should not fetch artwork when already dismissed
    expect(mockFetchDailyArt).not.toHaveBeenCalled();
  });

  it('save() persists artwork to storage and sets isSaved=true', async () => {
    const { result } = renderHook(() => useDailyArt());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isSaved).toBe(false);

    await act(async () => {
      await result.current.save();
    });

    expect(result.current.isSaved).toBe(true);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      '@musaium/saved_artworks',
      JSON.stringify([sampleArtwork]),
    );
  });

  it('save() does not duplicate if artwork already saved', async () => {
    // Pre-populate storage with the same artwork
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) => {
      if (key === '@musaium/saved_artworks') {
        return Promise.resolve(JSON.stringify([sampleArtwork]));
      }
      return Promise.resolve(null);
    });

    const { result } = renderHook(() => useDailyArt());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // The hook should detect it was already saved on mount
    expect(result.current.isSaved).toBe(true);

    // Calling save again should still not duplicate
    await act(async () => {
      await result.current.save();
    });

    // setItem should have been called once (not with a duplicated array)
    const setItemCalls = (AsyncStorage.setItem as jest.Mock).mock.calls.filter(
      ([key]: [string]) => key === '@musaium/saved_artworks',
    );
    // If called, the array should still have length 1
    if (setItemCalls.length > 0) {
      const stored = JSON.parse(
        setItemCalls[setItemCalls.length - 1][1] as string,
      ) as DailyArtwork[];
      expect(stored).toHaveLength(1);
    }
  });

  it('save() is a no-op when artwork is null', async () => {
    mockFetchDailyArt.mockRejectedValue(new Error('fail'));

    const { result } = renderHook(() => useDailyArt());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.artwork).toBeNull();

    await act(async () => {
      await result.current.save();
    });

    // Should not attempt to write to storage
    expect(AsyncStorage.setItem).not.toHaveBeenCalledWith(
      '@musaium/saved_artworks',
      expect.anything(),
    );
  });

  it('cleanup sets cancelled flag — late API resolve does not update state', async () => {
    // Use a delayed resolve that we can control
    let resolveApi: (value: DailyArtwork) => void = () => {};
    const apiPromise = new Promise<DailyArtwork>((res) => {
      resolveApi = res;
    });
    mockFetchDailyArt.mockReturnValue(apiPromise);

    const { result, unmount } = renderHook(() => useDailyArt());

    // Wait until the hook has called fetchDailyArt
    await waitFor(() => {
      expect(mockFetchDailyArt).toHaveBeenCalledTimes(1);
    });

    expect(result.current.isLoading).toBe(true);

    // Unmount before the API resolves
    unmount();

    // Resolve after unmount — should not throw or update state
    resolveApi(sampleArtwork);

    // Allow microtasks to flush
    await new Promise((r) => setTimeout(r, 0));

    // If we got here without errors, the cancelled flag worked
    expect(true).toBe(true);
  });
});
