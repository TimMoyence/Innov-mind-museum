/**
 * Tests — favourites CRUD (W3 R15/R16).
 *
 * Asserts:
 *   - getFavourites returns [] on missing key + parse-error tolerance.
 *   - addFavourite is idempotent (newest first) + filters invalid IDs.
 *   - removeFavourite is a no-op when absent.
 *   - All operations tolerate storage failure silently.
 */

const mockGetItem = jest.fn<Promise<string | null>, [string]>();
const mockSetItem = jest.fn<Promise<void>, [string, string]>();

jest.mock('@/shared/infrastructure/storage', () => ({
  storage: {
    getItem: (key: string) => mockGetItem(key),
    setItem: (key: string, value: string) => mockSetItem(key, value),
    removeItem: jest.fn(),
    getJSON: jest.fn(),
    setJSON: jest.fn(),
  },
}));

import {
  MUSEUM_FAVOURITES_STORAGE_KEY,
  addFavourite,
  getFavourites,
  removeFavourite,
} from '@/features/museum/infrastructure/favourites';

describe('museum favourites', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetItem.mockResolvedValue(null);
    mockSetItem.mockResolvedValue(undefined);
  });

  describe('getFavourites', () => {
    it('returns [] when the storage key is missing', async () => {
      await expect(getFavourites()).resolves.toEqual([]);
      expect(mockGetItem).toHaveBeenCalledWith(MUSEUM_FAVOURITES_STORAGE_KEY);
    });

    it('returns the parsed list when storage holds a JSON array of integers', async () => {
      mockGetItem.mockResolvedValue(JSON.stringify([7, 42]));
      await expect(getFavourites()).resolves.toEqual([7, 42]);
    });

    it('filters out non-positive-integer entries', async () => {
      mockGetItem.mockResolvedValue(JSON.stringify([7, -1, 0, 'oops', null, 4.5, 42]));
      await expect(getFavourites()).resolves.toEqual([7, 42]);
    });

    it('returns [] when storage payload is not valid JSON', async () => {
      mockGetItem.mockResolvedValue('not-json{{{');
      await expect(getFavourites()).resolves.toEqual([]);
    });

    it('returns [] on storage read failure (silent tolerance)', async () => {
      mockGetItem.mockRejectedValue(new Error('Storage unavailable'));
      await expect(getFavourites()).resolves.toEqual([]);
    });
  });

  describe('addFavourite', () => {
    it('appends a new id (newest-first) when not already present', async () => {
      mockGetItem.mockResolvedValue(JSON.stringify([42]));
      await addFavourite(7);
      expect(mockSetItem).toHaveBeenCalledWith(
        MUSEUM_FAVOURITES_STORAGE_KEY,
        JSON.stringify([7, 42]),
      );
    });

    it('moves an existing id to the front (idempotent + LRU)', async () => {
      mockGetItem.mockResolvedValue(JSON.stringify([42, 7, 3]));
      await addFavourite(7);
      expect(mockSetItem).toHaveBeenCalledWith(
        MUSEUM_FAVOURITES_STORAGE_KEY,
        JSON.stringify([7, 42, 3]),
      );
    });

    it('rejects invalid IDs (non-integer / negative) silently — no write', async () => {
      await addFavourite(0);
      await addFavourite(-1);
      await addFavourite(Number.NaN);
      expect(mockSetItem).not.toHaveBeenCalled();
    });

    it('does NOT throw when storage write fails', async () => {
      mockSetItem.mockRejectedValue(new Error('Storage write fail'));
      await expect(addFavourite(7)).resolves.toBeUndefined();
    });
  });

  describe('removeFavourite', () => {
    it('removes the id from the list', async () => {
      mockGetItem.mockResolvedValue(JSON.stringify([7, 42, 3]));
      await removeFavourite(42);
      expect(mockSetItem).toHaveBeenCalledWith(
        MUSEUM_FAVOURITES_STORAGE_KEY,
        JSON.stringify([7, 3]),
      );
    });

    it('is a no-op write when id is absent', async () => {
      mockGetItem.mockResolvedValue(JSON.stringify([7, 3]));
      await removeFavourite(99);
      expect(mockSetItem).toHaveBeenCalledWith(
        MUSEUM_FAVOURITES_STORAGE_KEY,
        JSON.stringify([7, 3]),
      );
    });

    it('does NOT throw when storage write fails', async () => {
      mockSetItem.mockRejectedValue(new Error('Storage write fail'));
      await expect(removeFavourite(7)).resolves.toBeUndefined();
    });
  });
});
