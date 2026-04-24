import {
  createCachedOverpassClient,
  type OverpassMuseumResult,
} from '@shared/http/overpass.client';

import { makeCache } from '../../helpers/chat/cache.fixtures';

jest.mock('@shared/logger/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));

const SAMPLE_OSM_RESPONSE = {
  elements: [
    {
      type: 'node',
      id: 123,
      lat: 48.8606,
      lon: 2.3376,
      tags: { name: 'Louvre', tourism: 'museum', museum: 'art' },
    },
  ],
};

const SAMPLE_PARSED: OverpassMuseumResult = {
  name: 'Louvre',
  address: null,
  latitude: 48.8606,
  longitude: 2.3376,
  osmId: 123,
  museumType: 'art',
};

type FetchMock = jest.Mock<Promise<Partial<Response>>>;

function okFetch(): FetchMock {
  return jest.fn().mockResolvedValue({
    ok: true,
    json: async () => SAMPLE_OSM_RESPONSE,
  });
}

describe('createCachedOverpassClient', () => {
  const originalFetch = global.fetch;
  let fetchMock: FetchMock;

  beforeEach(() => {
    fetchMock = okFetch();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe('cache hit path', () => {
    it('returns the cached value without hitting Overpass', async () => {
      const cachedEntry = {
        value: [SAMPLE_PARSED],
        storedAtMs: Date.now(),
        ttlSeconds: 86_400,
      };
      const cache = makeCache({
        get: jest.fn().mockResolvedValue(cachedEntry),
      });
      const client = createCachedOverpassClient(cache);

      const result = await client({ lat: 48.8606, lng: 2.3376, radiusMeters: 5_000 });

      expect(result).toEqual([SAMPLE_PARSED]);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(cache.set).not.toHaveBeenCalled();
    });
  });

  describe('cache miss path', () => {
    it('hits the live Overpass API and stores the result with the positive TTL', async () => {
      const cache = makeCache();
      const client = createCachedOverpassClient(cache);

      const result = await client({ lat: 48.8606, lng: 2.3376, radiusMeters: 5_000 });

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ name: 'Louvre', museumType: 'art' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(cache.set).toHaveBeenCalledTimes(1);

      const [key, stored, ttl] = cache.set.mock.calls[0] as [
        string,
        { value: unknown; storedAtMs: number; ttlSeconds: number },
        number,
      ];
      // Key rounded to 3 decimals for lat/lng and 1 decimal for radius km.
      expect(key).toBe('overpass:nearby:48.861:2.338:5.0');
      expect(stored.value).toHaveLength(1);
      expect(stored.ttlSeconds).toBe(86_400);
      expect(ttl).toBe(86_400);
    });

    it('builds a distinct bbox cache key when bbox is provided', async () => {
      const cache = makeCache();
      const client = createCachedOverpassClient(cache);

      await client({ bbox: [-9.18, 38.69, -9.1, 38.75] });

      const [key] = cache.set.mock.calls[0] as [string, unknown, number];
      expect(key).toBe('overpass:bbox:-9.18,38.69,-9.10,38.75');
    });
  });

  describe('live failure path', () => {
    it('caches the empty array with the short negative TTL when Overpass all-endpoints fails', async () => {
      global.fetch = jest
        .fn()
        .mockRejectedValue(new Error('network down')) as unknown as typeof fetch;
      const cache = makeCache();
      const client = createCachedOverpassClient(cache);

      const result = await client({ lat: 48.86, lng: 2.34, radiusMeters: 5_000 });

      // The raw client returns [] on full failure (see queryOverpassMuseums).
      expect(result).toEqual([]);
      expect(cache.set).toHaveBeenCalledTimes(1);

      const [, stored, ttl] = cache.set.mock.calls[0] as [
        string,
        { value: unknown; storedAtMs: number; ttlSeconds: number },
        number,
      ];
      expect(stored.value).toEqual([]);
      expect(stored.ttlSeconds).toBe(3_600);
      expect(ttl).toBe(3_600);
    });

    it('caches an empty successful response with the short negative TTL (not positive)', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ elements: [] }),
      }) as unknown as typeof fetch;
      const cache = makeCache();
      const client = createCachedOverpassClient(cache);

      const result = await client({ lat: 48.86, lng: 2.34, radiusMeters: 5_000 });

      expect(result).toEqual([]);
      expect(cache.set).toHaveBeenCalledTimes(1);
      const [, stored, ttl] = cache.set.mock.calls[0] as [
        string,
        { value: unknown; storedAtMs: number; ttlSeconds: number },
        number,
      ];
      expect(stored.value).toEqual([]);
      expect(stored.ttlSeconds).toBe(3_600);
      expect(ttl).toBe(3_600);
    });

    it('fails open when the cache read itself throws and still serves the live result', async () => {
      const cache = makeCache({
        get: jest.fn().mockRejectedValue(new Error('redis down')),
      });
      const client = createCachedOverpassClient(cache);

      const result = await client({ lat: 48.8606, lng: 2.3376, radiusMeters: 5_000 });

      expect(result).toHaveLength(1);
      expect(fetchMock).toHaveBeenCalled();
    });
  });

  describe('probabilistic early expiration', () => {
    it('fires a background refresh when > 90% of the TTL has elapsed and the coin flip wins', async () => {
      const ttlSeconds = 86_400;
      const storedAtMs = Date.now() - 0.99 * ttlSeconds * 1_000;

      const cachedEntry = {
        value: [SAMPLE_PARSED],
        storedAtMs,
        ttlSeconds,
      };
      const cache = makeCache({
        get: jest.fn().mockResolvedValue(cachedEntry),
      });
      // Force the coin flip to win.
      const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);

      const client = createCachedOverpassClient(cache);
      const result = await client({ lat: 48.8606, lng: 2.3376, radiusMeters: 5_000 });

      // Cached value returned immediately.
      expect(result).toEqual([SAMPLE_PARSED]);

      // Yield so the background refresh schedules and lands its cache.set.
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(cache.set).toHaveBeenCalledTimes(1);

      randomSpy.mockRestore();
    });

    it('does NOT refresh when less than 90% of the TTL has elapsed', async () => {
      const ttlSeconds = 86_400;
      const cachedEntry = {
        value: [SAMPLE_PARSED],
        storedAtMs: Date.now() - 0.5 * ttlSeconds * 1_000,
        ttlSeconds,
      };
      const cache = makeCache({
        get: jest.fn().mockResolvedValue(cachedEntry),
      });
      const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);
      const client = createCachedOverpassClient(cache);

      await client({ lat: 48.8606, lng: 2.3376, radiusMeters: 5_000 });

      expect(fetchMock).not.toHaveBeenCalled();

      randomSpy.mockRestore();
    });
  });
});
