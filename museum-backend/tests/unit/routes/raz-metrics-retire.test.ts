import request from 'supertest';

import {
  createRouteTestApp,
  resetRateLimits,
  stopRateLimitSweep,
} from '../../helpers/http/route-test-setup';

describe('RAZ-M2-PROM', () => {
  beforeEach(() => {
    resetRateLimits();
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  it('RAZ-M2-PROM · GET /metrics n’existe plus et répond 404, /api/health répond toujours', async () => {
    const { app } = createRouteTestApp();

    const metrics = await request(app).get('/metrics');
    const health = await request(app).get('/api/health');

    expect(metrics.status).toBe(404);
    expect(health.status).toBe(200);
  });
});
