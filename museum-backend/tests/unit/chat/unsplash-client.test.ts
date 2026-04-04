import { UnsplashClient } from '@modules/chat/adapters/secondary/unsplash.client';

let fetchSpy: jest.SpyInstance;

beforeEach(() => {
  fetchSpy = jest.spyOn(globalThis, 'fetch');
});

afterEach(() => {
  fetchSpy.mockRestore();
});

/** Helper: builds a realistic Unsplash API photo result object. */
const makeUnsplashResult = (overrides: Record<string, unknown> = {}) => ({
  urls: {
    regular: 'https://img.unsplash.com/regular.jpg',
    small: 'https://img.unsplash.com/small.jpg',
  },
  description: 'A beautiful painting',
  alt_description: 'oil on canvas',
  width: 1920,
  height: 1080,
  user: { name: 'Jane Doe' },
  ...overrides,
});

describe('UnsplashClient', () => {
  const client = new UnsplashClient('test-access-key');

  describe('successful search', () => {
    it('returns mapped photos for valid results', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [makeUnsplashResult()],
        }),
      });

      const photos = await client.searchPhotos('monet');

      expect(photos).toHaveLength(1);
      expect(photos[0]).toEqual({
        url: 'https://img.unsplash.com/regular.jpg',
        thumbnailUrl: 'https://img.unsplash.com/small.jpg',
        caption: 'A beautiful painting',
        width: 1920,
        height: 1080,
        photographerName: 'Jane Doe',
      });
    });

    it('sends correct Authorization header and query params', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [] }),
      });

      await client.searchPhotos('starry night', 3);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('query=starry%20night');
      expect(url).toContain('per_page=3');
      expect(url).toContain('orientation=landscape');
      expect((options.headers as Record<string, string>).Authorization).toBe(
        'Client-ID test-access-key',
      );
    });

    it('returns empty array for empty results', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [] }),
      });

      const photos = await client.searchPhotos('abstract');

      expect(photos).toEqual([]);
    });
  });

  describe('non-ok HTTP responses', () => {
    it('returns empty array on 401 Unauthorized', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      const photos = await client.searchPhotos('monet');

      expect(photos).toEqual([]);
    });

    it('returns empty array on 429 Rate Limited', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 429,
      });

      const photos = await client.searchPhotos('monet');

      expect(photos).toEqual([]);
    });
  });

  describe('timeout / abort handling', () => {
    it('returns empty array on AbortError (timeout)', async () => {
      fetchSpy.mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            setTimeout(() => {
              const err = new Error('This operation was aborted');
              err.name = 'AbortError';
              reject(err);
            }, 5);
          }),
      );

      const photos = await client.searchPhotos('monet');

      expect(photos).toEqual([]);
    });
  });

  describe('network error handling', () => {
    it('returns empty array on network failure', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('Failed to fetch'));

      const photos = await client.searchPhotos('monet');

      expect(photos).toEqual([]);
    });

    it('returns empty array on non-Error throw', async () => {
      fetchSpy.mockRejectedValueOnce('string error');

      const photos = await client.searchPhotos('monet');

      expect(photos).toEqual([]);
    });
  });

  describe('null safety — mapResult() via searchPhotos()', () => {
    it('filters out results with missing urls object', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [{ description: 'no urls', width: 100, height: 100 }],
        }),
      });

      const photos = await client.searchPhotos('monet');

      expect(photos).toEqual([]);
    });

    it('filters out results where urls.regular is missing', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            { urls: { small: 'https://img.unsplash.com/small.jpg' }, width: 100, height: 100 },
          ],
        }),
      });

      const photos = await client.searchPhotos('monet');

      expect(photos).toEqual([]);
    });

    it('filters out results where urls.small is missing', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            { urls: { regular: 'https://img.unsplash.com/regular.jpg' }, width: 100, height: 100 },
          ],
        }),
      });

      const photos = await client.searchPhotos('monet');

      expect(photos).toEqual([]);
    });

    it('uses alt_description when description is null', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [makeUnsplashResult({ description: null })],
        }),
      });

      const photos = await client.searchPhotos('monet');

      expect(photos).toHaveLength(1);
      expect(photos[0].caption).toBe('oil on canvas');
    });

    it('uses empty string caption when both description and alt_description are missing', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [makeUnsplashResult({ description: null, alt_description: null })],
        }),
      });

      const photos = await client.searchPhotos('monet');

      expect(photos).toHaveLength(1);
      expect(photos[0].caption).toBe('');
    });

    it('defaults width and height to 0 when not numbers', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [makeUnsplashResult({ width: 'wide', height: undefined })],
        }),
      });

      const photos = await client.searchPhotos('monet');

      expect(photos).toHaveLength(1);
      expect(photos[0].width).toBe(0);
      expect(photos[0].height).toBe(0);
    });

    it('defaults photographerName to "Unknown" when user is missing', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [makeUnsplashResult({ user: undefined })],
        }),
      });

      const photos = await client.searchPhotos('monet');

      expect(photos).toHaveLength(1);
      expect(photos[0].photographerName).toBe('Unknown');
    });

    it('defaults photographerName to "Unknown" when user.name is not a string', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [makeUnsplashResult({ user: { name: 42 } })],
        }),
      });

      const photos = await client.searchPhotos('monet');

      expect(photos).toHaveLength(1);
      expect(photos[0].photographerName).toBe('Unknown');
    });

    it('filters out null entries in results array', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [null, undefined, makeUnsplashResult()],
        }),
      });

      const photos = await client.searchPhotos('monet');

      expect(photos).toHaveLength(1);
    });

    it('returns empty array when data.results is not an array', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: 'not-an-array' }),
      });

      const photos = await client.searchPhotos('monet');

      expect(photos).toEqual([]);
    });

    it('returns empty array when data.results is undefined', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const photos = await client.searchPhotos('monet');

      expect(photos).toEqual([]);
    });
  });
});
