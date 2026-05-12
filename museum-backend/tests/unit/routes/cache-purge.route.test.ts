import express from 'express';
import request from 'supertest';

import { createCachePurgeRouter } from '@modules/admin/adapters/primary/http/routes/cache-purge.route';
import { errorHandler } from '@src/helpers/middleware/error.middleware';

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

const makeCacheMock = (overrides: Partial<CacheService> = {}): CacheService => ({
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  delByPrefix: jest.fn().mockResolvedValue(undefined),
  ...overrides,
}) as unknown as CacheService;

describe('POST /api/admin/museums/:id/cache/purge', () => {
  it('purges LLM cache by prefix and returns timing (admin token)', async () => {
    const cache = makeCacheMock();
    const app = buildApp(cache);

    const res = await request(app)
      .post('/api/admin/museums/abc-123/cache/purge')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.museumId).toBe('abc-123');
    expect(typeof res.body.durationMs).toBe('number');
    expect(cache.delByPrefix).toHaveBeenCalledWith('chat:llm:abc-123:');
  });

  it('rejects non-admin role with 403', async () => {
    const cache = makeCacheMock();
    const app = buildApp(cache);

    const res = await request(app)
      .post('/api/admin/museums/abc-123/cache/purge')
      .set('Authorization', `Bearer ${visitorToken()}`);

    expect(res.status).toBe(403);
    expect(cache.delByPrefix).not.toHaveBeenCalled();
  });

  it('rejects missing auth with 401', async () => {
    const cache = makeCacheMock();
    const app = buildApp(cache);

    const res = await request(app).post('/api/admin/museums/abc-123/cache/purge');

    expect(res.status).toBe(401);
    expect(cache.delByPrefix).not.toHaveBeenCalled();
  });
});
