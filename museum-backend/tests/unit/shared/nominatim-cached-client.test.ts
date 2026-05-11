import { createCachedNominatimClient } from '@shared/http/nominatim.client';
import { logger } from '@shared/logger/logger';

import { makeCache } from '../../helpers/chat/cache.fixtures';

// Suppress + spy logger output during tests
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

      // Confirm the cache-read-failure warning was logged with the proper
      // event name and payload (defensive: this branch is otherwise silent).
      expect(mockedLogger.warn).toHaveBeenCalledWith(
        'Nominatim cache read failed, falling back to live',
        expect.objectContaining({
          error: 'redis down',
          cacheKey: 'nominatim:rev:48.861:2.338',
        }),
      );
    });

    it('fails open when cache.set throws on the live write path, logs the warning, and still returns the live value', async () => {
      // Kills, for the cache-write failure path:
      //  - BlockStatement {} on the catch body (line 423)
      //  - StringLiteral '' on the warn event name (line 424)
      //  - ObjectLiteral {} on the warn payload (line 424)
      const cache = makeCache({
        set: jest.fn().mockRejectedValue(new Error('redis write down')),
      });
      const client = createCachedNominatimClient(cache);

      const result = await client(48.8606, 2.3376);

      // Live result still served despite cache write failure.
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
    it('fires a background refresh when > 90% of the TTL has elapsed and the coin flip wins; the refreshed entry carries value + storedAtMs + ttlSeconds', async () => {
      // Kills on the background-refresh path:
      //  - 328:47 ObjectLiteral {} → the entry object must contain the
      //    full {value, storedAtMs, ttlSeconds} triple (asserted below).
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

      // Assert the entry written back carries the full triple (kills the
      // ObjectLiteral {} mutation on line 328).
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
      // Kills on the fireBackgroundRefresh catch path:
      //  - BlockStatement {} on the catch body (line 334)
      //  - StringLiteral '' on the warn event name (line 335)
      //  - ObjectLiteral {} on the warn payload (line 335)
      const ttlSeconds = 86_400;
      const storedAtMs = Date.now() - 0.99 * ttlSeconds * 1_000;

      const cachedEntry = {
        value: SAMPLE_MAPPED,
        storedAtMs,
        ttlSeconds,
      };
      // get returns the cached entry; set rejects so the background refresh
      // routes through the catch.
      const cache = makeCache({
        get: jest.fn().mockResolvedValue(cachedEntry),
        set: jest.fn().mockRejectedValue(new Error('bg-set-down')),
      });
      const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);

      const client = createCachedNominatimClient(cache);
      const result = await client(48.8606, 2.3376);
      expect(result).toEqual(SAMPLE_MAPPED);

      // Wait for background refresh to flush (>=1s rate-limit + log).
      await new Promise((resolve) => setTimeout(resolve, 1_500));

      // Verify the dedicated background-refresh warning fired with the
      // correct event name and payload shape.
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

    it('does NOT refresh when ttlSeconds === 0 even with elapsedMs > 0 and Math.random forced to 0', async () => {
      // Kills shouldEarlyRefresh boundary mutations on line 355:
      //  - EqualityOperator `ttlMs <= 0` → `ttlMs < 0` (mutation would let
      //    ttlMs===0 fall through into the elapsedRatio = Infinity branch,
      //    where the coin flip with Math.random=0 would WIN and fire a
      //    background fetch).
      //  - BooleanLiteral `return false` → `return true` (mutation would
      //    flip the guard to return true and fire a background fetch).
      const ttlSeconds = 0;
      const cachedEntry = {
        value: SAMPLE_MAPPED,
        storedAtMs: Date.now() - 5_000, // 5s ago so elapsedMs is strictly > 0
        ttlSeconds,
      };
      const cache = makeCache({
        get: jest.fn().mockResolvedValue(cachedEntry),
      });
      const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);
      const client = createCachedNominatimClient(cache);

      const result = await client(48.8606, 2.3376);
      expect(result).toEqual(SAMPLE_MAPPED);

      // Give any rogue background refresh time to fire — it must NOT.
      await new Promise((resolve) => setTimeout(resolve, 1_200));

      expect(fetchMock).not.toHaveBeenCalled();
      expect(cache.set).not.toHaveBeenCalled();

      randomSpy.mockRestore();
    }, 10_000);

    it('does NOT refresh when elapsedRatio is exactly 0.9 and Math.random is exactly 0 (strict `<` boundary)', async () => {
      // Kills the EqualityOperator mutation on line 359:
      //  `Math.random() < (ratio - 0.9) / (1 - 0.9)` → `<=`
      // At ratio === 0.9 the rolled probability is 0; original `0 < 0 = false`
      // (no refresh), mutated `0 <= 0 = true` (would refresh).
      //
      // We must pin Date.now() to a fixed instant so the ratio is EXACTLY
      // 0.9 — otherwise the few milliseconds between entry construction and
      // the shouldEarlyRefresh evaluation push ratio slightly above 0.9 and
      // the test stops exercising the strict-boundary.
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
      const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(FIXED_NOW);
      const client = createCachedNominatimClient(cache);

      await client(48.8606, 2.3376);

      // Give any rogue background refresh time to fire — it must NOT.
      await new Promise((resolve) => setTimeout(resolve, 1_200));

      expect(fetchMock).not.toHaveBeenCalled();

      nowSpy.mockRestore();
      randomSpy.mockRestore();
    }, 10_000);

    it('DOES refresh at ratio 0.95 with Math.random=0.1 (kills divisor → multiplier arithmetic mutation)', async () => {
      // Kills the ArithmeticOperator mutation on line 359:
      //   `/ (1 - EARLY_REFRESH_THRESHOLD)` → `* (1 - ...)`.
      // At ratio = 0.95:
      //   original probability = (0.95 - 0.9) / 0.1 = 0.5
      //   mutated  probability = (0.95 - 0.9) * 0.1 = 0.005
      // With Math.random() = 0.1, original: 0.1 < 0.5 = true (refresh fires),
      // mutated: 0.1 < 0.005 = false (no refresh).
      const ttlSeconds = 86_400;
      const cachedEntry = {
        value: SAMPLE_MAPPED,
        storedAtMs: Date.now() - 0.95 * ttlSeconds * 1_000,
        ttlSeconds,
      };
      const cache = makeCache({
        get: jest.fn().mockResolvedValue(cachedEntry),
      });
      const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.1);
      const client = createCachedNominatimClient(cache);

      await client(48.8606, 2.3376);

      // Wait for background refresh to clear the rate limiter + cache.set.
      await new Promise((resolve) => setTimeout(resolve, 1_500));

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(cache.set).toHaveBeenCalledTimes(1);

      randomSpy.mockRestore();
    }, 10_000);

    it('does NOT refresh at ratio 0.95 with Math.random=0.9 (kills subtraction → addition arithmetic mutation)', async () => {
      // Kills the ArithmeticOperator mutation on line 359:
      //   `(elapsedRatio - EARLY_REFRESH_THRESHOLD)` → `(elapsedRatio + ...)`.
      // At ratio = 0.95:
      //   original probability = (0.95 - 0.9) / 0.1 = 0.5
      //   mutated  probability = (0.95 + 0.9) / 0.1 = 18.5
      // With Math.random() = 0.9, original: 0.9 < 0.5 = false (no refresh),
      // mutated: 0.9 < 18.5 = true (refresh fires).
      const ttlSeconds = 86_400;
      const cachedEntry = {
        value: SAMPLE_MAPPED,
        storedAtMs: Date.now() - 0.95 * ttlSeconds * 1_000,
        ttlSeconds,
      };
      const cache = makeCache({
        get: jest.fn().mockResolvedValue(cachedEntry),
      });
      const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.9);
      const client = createCachedNominatimClient(cache);

      await client(48.8606, 2.3376);

      // Give any rogue background refresh time to fire — it must NOT.
      await new Promise((resolve) => setTimeout(resolve, 1_200));

      expect(fetchMock).not.toHaveBeenCalled();

      randomSpy.mockRestore();
    }, 10_000);
  });
});
