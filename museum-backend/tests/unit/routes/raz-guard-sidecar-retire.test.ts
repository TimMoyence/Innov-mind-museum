import request from 'supertest';

import {
  createRouteTestApp,
  resetRateLimits,
  stopRateLimitSweep,
} from '../../helpers/http/route-test-setup';

describe('RAZ-M1-GUARD', () => {
  beforeEach(() => {
    resetRateLimits();
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  it('RAZ-M1-GUARD · /api/health répond status ok sans contrôle LLM-Guard, /api/health/deep et /api/chat/describe répondent 404', async () => {
    const { app } = createRouteTestApp();

    const health = await request(app).get('/api/health');
    const deep = await request(app).get('/api/health/deep');
    const describeRoute = await request(app).post('/api/chat/describe').send({ text: 'Mona Lisa' });

    expect(health.status).toBe(200);
    expect(health.body.status).toBe('ok');
    expect(health.body.checks).not.toHaveProperty('llmGuard');
    expect(deep.status).toBe(404);
    expect(describeRoute.status).toBe(404);
  });
});
