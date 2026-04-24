import { createCachedNominatimClient } from '@shared/http/nominatim.client';

import { makeCache } from '../../helpers/chat/cache.fixtures';

// Suppress logger output during tests
jest.mock('@shared/logger/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));

const SAMPLE_RESPONSE = {
  display_name: 'Rue de Rivoli, Paris, France',
  address: { road: 'Rue de Rivoli', city: 'Paris', country: 'France' },
};

const SAMPLE_MAPPED = {
  displayName: 'Rue de Rivoli, Paris, France',
  address: {
    road: 'Rue de Rivoli',
    neighbourhood: undefined,
    suburb: undefined,
    city: 'Paris',
    country: 'France',
  },
  name: undefined,
};

type FetchMock = jest.Mock<Promise<Partial<Response>>>;

function okFetch(): FetchMock {
  return jest.fn().mockResolvedValue({
    ok: true,
    json: async () => SAMPLE_RESPONSE,
  });
}

describe('createCachedNominatimClient', () => {
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
    it('returns the cached value without hitting Nominatim', async () => {
      const cachedEntry = {
        value: SAMPLE_MAPPED,
        storedAtMs: Date.now(),
        ttlSeconds: 86_400,
      };
      const cache = makeCache({
        get: jest.fn().mockResolvedValue(cachedEntry),
      });
      const client = createCachedNominatimClient(cache);

      const result = await client(48.8606, 2.3376);

      expect(result).toEqual(SAMPLE_MAPPED);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(cache.set).not.toHaveBeenCalled();
    });
  });

  describe('cache miss path', () => {
    it('hits the live Nominatim API and stores the result with the positive TTL', async () => {
      const cache = makeCache();
      const client = createCachedNominatimClient(cache);

      const result = await client(48.8606, 2.3376);

      expect(result).toMatchObject({
        displayName: 'Rue de Rivoli, Paris, France',
        address: { road: 'Rue de Rivoli', city: 'Paris', country: 'France' },
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(cache.set).toHaveBeenCalledTimes(1);

      const [key, stored, ttl] = cache.set.mock.calls[0] as [
        string,
        { value: unknown; storedAtMs: number; ttlSeconds: number },
        number,
      ];
      expect(key).toBe('nominatim:rev:48.861:2.338');
      expect(stored.value).toMatchObject({ displayName: 'Rue de Rivoli, Paris, France' });
      expect(stored.ttlSeconds).toBe(86_400);
      expect(ttl).toBe(86_400);
    });

    it('sends a User-Agent header matching the OSMF-compliant format', async () => {
      const cache = makeCache();
      const client = createCachedNominatimClient(cache);

      await client(48.8606, 2.3376);

      const fetchOptions = fetchMock.mock.calls[0][1] as RequestInit;
      const headers = fetchOptions.headers as Record<string, string>;
      expect(headers['User-Agent']).toMatch(/^Musaium\/\S+ \(contact: \S+\)$/);
    });
  });

  describe('live failure path', () => {
    it('returns null and caches the null sentinel with the short negative TTL', async () => {
      global.fetch = jest
        .fn()
        .mockRejectedValue(new Error('network down')) as unknown as typeof fetch;
      const cache = makeCache();
      const client = createCachedNominatimClient(cache);

      const result = await client(48.8606, 2.3376);

      expect(result).toBeNull();
      expect(cache.set).toHaveBeenCalledTimes(1);

      const [, stored, ttl] = cache.set.mock.calls[0] as [
        string,
        { value: unknown; storedAtMs: number; ttlSeconds: number },
        number,
      ];
      expect(stored.value).toBeNull();
      expect(stored.ttlSeconds).toBe(3_600);
      expect(ttl).toBe(3_600);
    });

    it('fails open when the cache read itself throws and still serves the live result', async () => {
      const cache = makeCache({
        get: jest.fn().mockRejectedValue(new Error('redis down')),
      });
      const client = createCachedNominatimClient(cache);

      const result = await client(48.8606, 2.3376);

      expect(result).toMatchObject({ displayName: 'Rue de Rivoli, Paris, France' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('rate limiter', () => {
    it('serialises >=2 concurrent live calls with at least 1s spacing', async () => {
      // Pre-seed different coordinates so both calls miss the cache and must
      // go to the live path (and therefore through the rate limiter).
      const cache = makeCache();
      const client = createCachedNominatimClient(cache);

      const callTimestamps: number[] = [];
      global.fetch = jest.fn().mockImplementation(() => {
        callTimestamps.push(Date.now());
        return Promise.resolve({
          ok: true,
          json: async () => SAMPLE_RESPONSE,
        });
      }) as unknown as typeof fetch;

      await Promise.all([client(1.0, 2.0), client(3.0, 4.0)]);

      expect(callTimestamps).toHaveLength(2);
      const spacingMs = callTimestamps[1] - callTimestamps[0];
      // OSMF policy: >= 1 req/s. Allow a small floor (950ms) for timer drift.
      expect(spacingMs).toBeGreaterThanOrEqual(950);
    }, 10_000);
  });

  describe('probabilistic early expiration', () => {
    it('fires a background refresh when > 90% of the TTL has elapsed and the coin flip wins', async () => {
      const ttlSeconds = 86_400;
      // Stored 99% of TTL ago — well inside the early-refresh window.
      const storedAtMs = Date.now() - 0.99 * ttlSeconds * 1_000;

      const cachedEntry = {
        value: SAMPLE_MAPPED,
        storedAtMs,
        ttlSeconds,
      };
      const cache = makeCache({
        get: jest.fn().mockResolvedValue(cachedEntry),
      });
      // Force the coin flip to win: Math.random() returns 0 → < any positive prob.
      const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);

      const client = createCachedNominatimClient(cache);
      const result = await client(48.8606, 2.3376);

      // Cached value returned immediately.
      expect(result).toEqual(SAMPLE_MAPPED);

      // Give the background refresh enough time to clear the in-process
      // rate limiter (>= 1s per OSMF policy) and then land its cache.set.
      await new Promise((resolve) => setTimeout(resolve, 1_500));

      // Background refresh fired: live fetch hit + cache.set called to write
      // the refreshed value back.
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(cache.set).toHaveBeenCalledTimes(1);

      randomSpy.mockRestore();
    }, 10_000);

    it('does NOT refresh when less than 90% of the TTL has elapsed', async () => {
      const ttlSeconds = 86_400;
      const cachedEntry = {
        value: SAMPLE_MAPPED,
        storedAtMs: Date.now() - 0.5 * ttlSeconds * 1_000, // 50% elapsed
        ttlSeconds,
      };
      const cache = makeCache({
        get: jest.fn().mockResolvedValue(cachedEntry),
      });
      const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);
      const client = createCachedNominatimClient(cache);

      await client(48.8606, 2.3376);

      // No background refresh: we're way below the threshold.
      expect(fetchMock).not.toHaveBeenCalled();

      randomSpy.mockRestore();
    });
  });
});
