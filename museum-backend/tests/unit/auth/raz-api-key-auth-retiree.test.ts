import request from 'supertest';

import {
  createRouteTestApp,
  resetRateLimits,
  stopRateLimitSweep,
} from '../../helpers/http/route-test-setup';

describe('RAZ-B2B-AUTH', () => {
  beforeEach(() => {
    resetRateLimits();
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  it("RAZ-B2B-AUTH · un Bearer msk_ sur /api/auth/me reçoit la même réponse 401 Invalid token qu'un jeton invalide", async () => {
    const { app } = createRouteTestApp();

    const invalidJwt = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer not-a-jwt');
    const mskKey = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer msk_abcdefgh0123456789abcdefgh0123456789abcdef');

    expect(invalidJwt.status).toBe(401);
    expect(invalidJwt.body.error.message).toBe('Invalid token');
    expect({ status: mskKey.status, message: mskKey.body.error?.message }).toEqual({
      status: 401,
      message: 'Invalid token',
    });
  });
});
