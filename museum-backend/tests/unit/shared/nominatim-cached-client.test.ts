import { randomSource } from '@shared/utils/random';
import { createCachedNominatimClient } from '@shared/http/nominatim.client';
import { logger } from '@shared/logger/logger';

import { makeCache } from '../../helpers/chat/cache.fixtures';

jest.mock('@shared/logger/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const mockedLogger = logger as jest.Mocked<typeof logger>;

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
    mockedLogger.warn.mockClear();
    mockedLogger.info.mockClear();
    mockedLogger.error.mockClear();
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
      expect(typeof stored.storedAtMs).toBe('number');
      expect(stored.storedAtMs).toBeGreaterThan(0);
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
    it('returns null and caches the null sentinel with the outage TTL, never the negative TTL of a real miss', async () => {
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
      expect(stored.ttlSeconds).toBe(60);
      expect(ttl).toBe(60);
    });

    it('fails open when the cache read itself throws and still serves the live result', async () => {
      const cache = makeCache({
        get: jest.fn().mockRejectedValue(new Error('redis down')),
      });
      const client = createCachedNominatimClient(cache);

      const result = await client(48.8606, 2.3376);

      expect(result).toMatchObject({ displayName: 'Rue de Rivoli, Paris, France' });
      expect(fetchMock).toHaveBeenCalledTimes(1);

      expect(mockedLogger.warn).toHaveBeenCalledWith(
        'Nominatim cache read failed, falling back to live',
        expect.objectContaining({
          error: 'redis down',
          cacheKey: 'nominatim:rev:48.861:2.338',
        }),
      );
    });

    it('fails open when cache.set throws on the live write path, logs the warning, and still returns the live value', async () => {
      const cache = makeCache({
        set: jest.fn().mockRejectedValue(new Error('redis write down')),
      });
      const client = createCachedNominatimClient(cache);

      const result = await client(48.8606, 2.3376);

      expect(result).toMatchObject({ displayName: 'Rue de Rivoli, Paris, France' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(cache.set).toHaveBeenCalledTimes(1);

      expect(mockedLogger.warn).toHaveBeenCalledWith(
        'Nominatim cache write failed, serving live result',
        expect.objectContaining({
          error: 'redis write down',
          cacheKey: 'nominatim:rev:48.861:2.338',
        }),
      );
    });

    it('stringifies a non-Error rejection from cache.set when logging the cache-write warning', async () => {
      const cache = makeCache({
        set: jest.fn().mockRejectedValue('write-boom'),
      });
      const client = createCachedNominatimClient(cache);

      await client(48.8606, 2.3376);

      expect(mockedLogger.warn).toHaveBeenCalledWith(
        'Nominatim cache write failed, serving live result',
        expect.objectContaining({
          error: 'write-boom',
          cacheKey: 'nominatim:rev:48.861:2.338',
        }),
      );
    });
  });

  describe('rate limiter', () => {
    it('serialises >=2 concurrent live calls with at least 1s spacing', async () => {
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
      expect(spacingMs).toBeGreaterThanOrEqual(950);
    }, 10_000);
  });

  describe('probabilistic early expiration', () => {
    it('fires a background refresh when > 90% of the TTL has elapsed and the coin flip wins; the refreshed entry carries value + storedAtMs + ttlSeconds', async () => {
      const ttlSeconds = 86_400;
      const storedAtMs = Date.now() - 0.99 * ttlSeconds * 1_000;

      const cachedEntry = {
        value: SAMPLE_MAPPED,
        storedAtMs,
        ttlSeconds,
      };
      const cache = makeCache({
        get: jest.fn().mockResolvedValue(cachedEntry),
      });
      const randomSpy = jest.spyOn(randomSource, 'unit').mockReturnValue(0);

      const client = createCachedNominatimClient(cache);
      const result = await client(48.8606, 2.3376);

      expect(result).toEqual(SAMPLE_MAPPED);

      await new Promise((resolve) => setTimeout(resolve, 1_500));

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(cache.set).toHaveBeenCalledTimes(1);

      const [, stored, ttl] = cache.set.mock.calls[0] as [
        string,
        { value: unknown; storedAtMs: number; ttlSeconds: number },
        number,
      ];
      expect(stored).toEqual(
        expect.objectContaining({
          value: expect.objectContaining({ displayName: 'Rue de Rivoli, Paris, France' }),
          storedAtMs: expect.any(Number),
          ttlSeconds: 86_400,
        }),
      );
      expect(stored.storedAtMs).toBeGreaterThan(0);
      expect(ttl).toBe(86_400);

      randomSpy.mockRestore();
    }, 10_000);

    it('background refresh that fails on cache.set logs the dedicated warning event with error + cacheKey', async () => {
      const ttlSeconds = 86_400;
      const storedAtMs = Date.now() - 0.99 * ttlSeconds * 1_000;

      const cachedEntry = {
        value: SAMPLE_MAPPED,
        storedAtMs,
        ttlSeconds,
      };
      const cache = makeCache({
        get: jest.fn().mockResolvedValue(cachedEntry),
        set: jest.fn().mockRejectedValue(new Error('bg-set-down')),
      });
      const randomSpy = jest.spyOn(randomSource, 'unit').mockReturnValue(0);

      const client = createCachedNominatimClient(cache);
      const result = await client(48.8606, 2.3376);
      expect(result).toEqual(SAMPLE_MAPPED);

      await new Promise((resolve) => setTimeout(resolve, 1_500));

      expect(mockedLogger.warn).toHaveBeenCalledWith(
        'Nominatim background refresh failed',
        expect.objectContaining({
          error: 'bg-set-down',
          cacheKey: 'nominatim:rev:48.861:2.338',
        }),
      );

      randomSpy.mockRestore();
    }, 10_000);

    it('does NOT refresh when less than 90% of the TTL has elapsed', async () => {
      const ttlSeconds = 86_400;
      const cachedEntry = {
        value: SAMPLE_MAPPED,
        storedAtMs: Date.now() - 0.5 * ttlSeconds * 1_000,
        ttlSeconds,
      };
      const cache = makeCache({
        get: jest.fn().mockResolvedValue(cachedEntry),
      });
      const randomSpy = jest.spyOn(randomSource, 'unit').mockReturnValue(0);
      const client = createCachedNominatimClient(cache);

      await client(48.8606, 2.3376);

      expect(fetchMock).not.toHaveBeenCalled();

      randomSpy.mockRestore();
    });

    it('does NOT refresh when ttlSeconds === 0 even with elapsedMs > 0 and Math.random forced to 0', async () => {
      const ttlSeconds = 0;
      const cachedEntry = {
        value: SAMPLE_MAPPED,
        storedAtMs: Date.now() - 5_000,
        ttlSeconds,
      };
      const cache = makeCache({
        get: jest.fn().mockResolvedValue(cachedEntry),
      });
      const randomSpy = jest.spyOn(randomSource, 'unit').mockReturnValue(0);
      const client = createCachedNominatimClient(cache);

      const result = await client(48.8606, 2.3376);
      expect(result).toEqual(SAMPLE_MAPPED);

      await new Promise((resolve) => setTimeout(resolve, 1_200));

      expect(fetchMock).not.toHaveBeenCalled();
      expect(cache.set).not.toHaveBeenCalled();

      randomSpy.mockRestore();
    }, 10_000);

    it('does NOT refresh when elapsedRatio is exactly 0.9 and Math.random is exactly 0 (strict `<` boundary)', async () => {
      const ttlSeconds = 10_000;
      const FIXED_NOW = 1_700_000_000_000;
      const cachedEntry = {
        value: SAMPLE_MAPPED,
        storedAtMs: FIXED_NOW - 0.9 * ttlSeconds * 1_000,
        ttlSeconds,
      };
      const cache = makeCache({
        get: jest.fn().mockResolvedValue(cachedEntry),
      });
      const randomSpy = jest.spyOn(randomSource, 'unit').mockReturnValue(0);
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(FIXED_NOW);
      const client = createCachedNominatimClient(cache);

      await client(48.8606, 2.3376);

      await new Promise((resolve) => setTimeout(resolve, 1_200));

      expect(fetchMock).not.toHaveBeenCalled();

      nowSpy.mockRestore();
      randomSpy.mockRestore();
    }, 10_000);

    it('DOES refresh at ratio 0.95 with Math.random=0.1 (kills divisor → multiplier arithmetic mutation)', async () => {
      const ttlSeconds = 86_400;
      const cachedEntry = {
        value: SAMPLE_MAPPED,
        storedAtMs: Date.now() - 0.95 * ttlSeconds * 1_000,
        ttlSeconds,
      };
      const cache = makeCache({
        get: jest.fn().mockResolvedValue(cachedEntry),
      });
      const randomSpy = jest.spyOn(randomSource, 'unit').mockReturnValue(0.1);
      const client = createCachedNominatimClient(cache);

      await client(48.8606, 2.3376);

      await new Promise((resolve) => setTimeout(resolve, 1_500));

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(cache.set).toHaveBeenCalledTimes(1);

      randomSpy.mockRestore();
    }, 10_000);

    it('does NOT refresh at ratio 0.95 with Math.random=0.9 (kills subtraction → addition arithmetic mutation)', async () => {
      const ttlSeconds = 86_400;
      const cachedEntry = {
        value: SAMPLE_MAPPED,
        storedAtMs: Date.now() - 0.95 * ttlSeconds * 1_000,
        ttlSeconds,
      };
      const cache = makeCache({
        get: jest.fn().mockResolvedValue(cachedEntry),
      });
      const randomSpy = jest.spyOn(randomSource, 'unit').mockReturnValue(0.9);
      const client = createCachedNominatimClient(cache);

      await client(48.8606, 2.3376);

      await new Promise((resolve) => setTimeout(resolve, 1_200));

      expect(fetchMock).not.toHaveBeenCalled();

      randomSpy.mockRestore();
    }, 10_000);
  });
});
