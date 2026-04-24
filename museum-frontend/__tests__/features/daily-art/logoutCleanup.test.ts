jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
      setItem: jest.fn((key: string, value: string) => {
        store.set(key, value);
        return Promise.resolve();
      }),
      removeItem: jest.fn((key: string) => {
        store.delete(key);
        return Promise.resolve();
      }),
    },
  };
});

import AsyncStorage from '@react-native-async-storage/async-storage';

import { clearDailyArtStorage } from '@/features/daily-art/application/logoutCleanup';
import { DISMISSED_KEY, SAVED_ARTWORKS_KEY } from '@/features/daily-art/application/useDailyArt';

describe('clearDailyArtStorage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('removes both saved_artworks and daily_art_dismissed keys', async () => {
    await AsyncStorage.setItem(SAVED_ARTWORKS_KEY, JSON.stringify([{ title: 'x' }]));
    await AsyncStorage.setItem(DISMISSED_KEY, '2026-04-24');

    await clearDailyArtStorage();

    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(SAVED_ARTWORKS_KEY);
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(DISMISSED_KEY);
    expect(await AsyncStorage.getItem(SAVED_ARTWORKS_KEY)).toBeNull();
    expect(await AsyncStorage.getItem(DISMISSED_KEY)).toBeNull();
  });

  it('is idempotent when no keys are present', async () => {
    await expect(clearDailyArtStorage()).resolves.toBeUndefined();
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(SAVED_ARTWORKS_KEY);
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(DISMISSED_KEY);
  });

  it('does not throw when AsyncStorage.removeItem rejects', async () => {
    (AsyncStorage.removeItem as jest.Mock).mockRejectedValueOnce(new Error('io failure'));

    await expect(clearDailyArtStorage()).resolves.toBeUndefined();
  });
});
