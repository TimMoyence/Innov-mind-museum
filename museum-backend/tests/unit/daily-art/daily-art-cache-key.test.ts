import express from 'express';
import request from 'supertest';

import { createDailyArtRouter } from '@modules/daily-art/adapters/primary/http/routes/daily-art.route';

import type { CacheService } from '@shared/cache/cache.port';

// Bypass auth so we exercise the cache-key logic only.
jest.mock('@shared/middleware/authenticated.middleware', () => ({
  isAuthenticated: (_req: unknown, _res: unknown, next: () => void): void => {
    next();
  },
}));

/**
 * Builds a `CacheService` double whose `get` always misses (so the route runs
 * `set`). The route only touches `get` + `set`; the remaining interface methods
 * are stubbed so the cast is sound.
 * @returns a jest-mocked CacheService.
 */
const makeCache = (): jest.Mocked<CacheService> =>
  ({
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
    delByPrefix: jest.fn().mockResolvedValue(undefined),
    setNx: jest.fn().mockResolvedValue(true),
    incrBy: jest.fn().mockResolvedValue(1),
    ping: jest.fn().mockResolvedValue(true),
    zadd: jest.fn().mockResolvedValue(undefined),
    ztop: jest.fn().mockResolvedValue([]),
  }) as unknown as jest.Mocked<CacheService>;

/**
 * QA-08: the daily-art cache key must include the locale so FR and EN responses
 * never collide in the cache.
 */
describe('GET /api/daily-art — locale-scoped cache key (QA-08)', () => {
  it('includes the locale in the cache key (read + write)', async () => {
    const cache = makeCache();
    const app = express();
    app.use(createDailyArtRouter(cache));

    await request(app).get('/?locale=fr');

    expect(cache.get).toHaveBeenCalledWith(expect.stringContaining(':fr'));
    expect(cache.set).toHaveBeenCalledWith(
      expect.stringContaining(':fr'),
      expect.anything(),
      expect.any(Number),
    );
  });

  it('uses distinct cache keys for different locales', async () => {
    const cache = makeCache();
    const app = express();
    app.use(createDailyArtRouter(cache));

    await request(app).get('/?locale=fr');
    await request(app).get('/?locale=es');

    const writtenKeys = cache.set.mock.calls.map((call) => call[0]);
    expect(writtenKeys.some((k) => k.includes(':fr'))).toBe(true);
    expect(writtenKeys.some((k) => k.includes(':es'))).toBe(true);
    expect(writtenKeys[0]).not.toBe(writtenKeys[1]);
  });
});
