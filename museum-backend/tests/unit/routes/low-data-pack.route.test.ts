import express from 'express';
import request from 'supertest';

import { createLowDataPackRouter } from '@modules/museum/adapters/primary/http/routes/low-data-pack.route';
import {
  clearRateLimitBuckets,
  stopRateLimitSweep,
} from '@shared/middleware/rate-limit.middleware';
import { errorHandler } from '@shared/middleware/error.middleware';
import { AppError } from '@shared/errors/app.error';

import { visitorToken } from '../../helpers/auth/token.helpers';

import type { LowDataPackService } from '@modules/museum/useCase/search/low-data-pack.service';

const buildApp = (service: LowDataPackService) => {
  const app = express();
  app.use(express.json());
  app.use('/api', createLowDataPackRouter(service));
  app.use(errorHandler);
  return app;
};

const makeServiceMock = (
  override?: Partial<LowDataPackService>,
): LowDataPackService =>
  ({
    getLowDataPack: jest.fn().mockResolvedValue({
      museumId: 'm-1',
      locale: 'fr',
      hours: [],
      bestPaths: [],
    }),
    ...override,
  }) as unknown as LowDataPackService;

describe('GET /api/museums/:id/low-data-pack', () => {
  beforeEach(() => {
    clearRateLimitBuckets();
  });
  afterAll(() => {
    stopRateLimitSweep();
  });

  it('returns pack on golden path (authenticated, default locale)', async () => {
    const service = makeServiceMock();
    const app = buildApp(service);

    const res = await request(app)
      .get('/api/museums/m-1/low-data-pack')
      .set('Authorization', `Bearer ${visitorToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.museumId).toBe('m-1');
    expect(res.headers['cache-control']).toContain('max-age=3600');
    expect(service.getLowDataPack).toHaveBeenCalledWith('m-1', 'fr');
  });

  it('forwards locale query param to the service', async () => {
    const service = makeServiceMock();
    const app = buildApp(service);

    await request(app)
      .get('/api/museums/m-1/low-data-pack?locale=en')
      .set('Authorization', `Bearer ${visitorToken()}`);

    expect(service.getLowDataPack).toHaveBeenCalledWith('m-1', 'en');
  });

  it('rejects missing auth with 401', async () => {
    const service = makeServiceMock();
    const app = buildApp(service);

    const res = await request(app).get('/api/museums/m-1/low-data-pack');

    expect(res.status).toBe(401);
    expect(service.getLowDataPack).not.toHaveBeenCalled();
  });

  it('surfaces service errors via the error middleware', async () => {
    const service = makeServiceMock({
      getLowDataPack: jest.fn().mockRejectedValue(
        new AppError({ message: 'museum not found', statusCode: 404, code: 'NOT_FOUND' }),
      ),
    });
    const app = buildApp(service);

    const res = await request(app)
      .get('/api/museums/missing/low-data-pack')
      .set('Authorization', `Bearer ${visitorToken()}`);

    expect(res.status).toBe(404);
  });
});
