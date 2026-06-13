import express from 'express';
import request from 'supertest';

import { createCachePurgeRouter } from '@modules/admin/adapters/primary/http/routes/cache-purge.route';
import { errorHandler } from '@shared/middleware/error.middleware';

import { adminToken, visitorToken } from '../../helpers/auth/token.helpers';

import type { CacheService } from '@shared/cache/cache.port';

jest.mock('@shared/audit', () => ({
  auditService: {
    log: jest.fn().mockResolvedValue(undefined),
  },
}));

const buildApp = (cache: CacheService) => {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', createCachePurgeRouter(cache));
  app.use(errorHandler);
  return app;
};

const makeCacheMock = (overrides: Partial<CacheService> = {}): CacheService =>
  ({
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    delByPrefix: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  }) as unknown as CacheService;

describe('POST /api/admin/museums/:id/cache/purge', () => {
  // I-FIX1 (2026-05-21) — the route now delegates to
  // `LlmCacheServiceImpl.invalidateMuseum`, which iterates `museum-mode` +
  // `personalized` contextClasses with the real v3 namespace
  // `llm:v3:{contextClass}:{museumId}:` (KEY_VERSION bumped v2→v3 on
  // 2026-06-12 for the lowDataMode dimension — US-12.2/INV-21).
  // Integer ids are required (rejects
  // non-numeric like the previous "abc-123" string ids). Full namespace +
  // boundary behaviour is covered by
  // `tests/integration/admin/cache-purge.namespace.test.ts`.
  it('purges LLM cache via invalidateMuseum and returns timing (admin token)', async () => {
    const cache = makeCacheMock();
    const app = buildApp(cache);

    const res = await request(app)
      .post('/api/admin/museums/42/cache/purge')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.museumId).toBe(42);
    expect(typeof res.body.durationMs).toBe('number');
    // invalidateMuseum issues TWO delByPrefix calls — museum-mode + personalized.
    expect(cache.delByPrefix).toHaveBeenCalledWith('llm:v3:museum-mode:42:');
    expect(cache.delByPrefix).toHaveBeenCalledWith('llm:v3:personalized:42:');
    expect(cache.delByPrefix).toHaveBeenCalledTimes(2);
  });

  it('rejects non-integer museum id with 400', async () => {
    const cache = makeCacheMock();
    const app = buildApp(cache);

    const res = await request(app)
      .post('/api/admin/museums/abc-123/cache/purge')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(400);
    expect(cache.delByPrefix).not.toHaveBeenCalled();
  });

  it('rejects non-positive museum id with 400', async () => {
    const cache = makeCacheMock();
    const app = buildApp(cache);

    const res = await request(app)
      .post('/api/admin/museums/0/cache/purge')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(400);
    expect(cache.delByPrefix).not.toHaveBeenCalled();
  });

  it('rejects non-admin role with 403', async () => {
    const cache = makeCacheMock();
    const app = buildApp(cache);

    const res = await request(app)
      .post('/api/admin/museums/42/cache/purge')
      .set('Authorization', `Bearer ${visitorToken()}`);

    expect(res.status).toBe(403);
    expect(cache.delByPrefix).not.toHaveBeenCalled();
  });

  it('rejects missing auth with 401', async () => {
    const cache = makeCacheMock();
    const app = buildApp(cache);

    const res = await request(app).post('/api/admin/museums/42/cache/purge');

    expect(res.status).toBe(401);
    expect(cache.delByPrefix).not.toHaveBeenCalled();
  });
});
