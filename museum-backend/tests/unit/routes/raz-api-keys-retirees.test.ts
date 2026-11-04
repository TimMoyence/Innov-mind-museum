import request from 'supertest';

import {
  createRouteTestApp,
  resetRateLimits,
  stopRateLimitSweep,
} from '../../helpers/http/route-test-setup';

describe('RAZ-B2B-ROUTES', () => {
  beforeEach(() => {
    resetRateLimits();
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  it("RAZ-B2B-ROUTES · /api/auth/api-keys n'existe plus et répond 404, /api/auth/me répond toujours 401 sans jeton", async () => {
    const { app } = createRouteTestApp();

    const created = await request(app).post('/api/auth/api-keys').send({ name: 'CI key' });
    const listed = await request(app).get('/api/auth/api-keys');
    const revoked = await request(app).delete('/api/auth/api-keys/1');
    const me = await request(app).get('/api/auth/me');

    expect([created.status, listed.status, revoked.status]).toEqual([404, 404, 404]);
    expect(me.status).toBe(401);
  });
});
