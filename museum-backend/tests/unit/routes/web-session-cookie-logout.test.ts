import request from 'supertest';

import { authSessionService } from '@modules/auth/useCase';
import { computeCsrfToken } from '@shared/middleware/csrf.middleware';

import { makeToken } from '../../helpers/auth/token.helpers';
import {
  createRouteTestApp,
  resetRateLimits,
  stopRateLimitSweep,
} from '../../helpers/http/route-test-setup';

describe('WEB-SESSION-LOGOUT', () => {
  beforeEach(() => {
    resetRateLimits();
    jest.restoreAllMocks();
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  it('WEB-SESSION-LOGOUT · la déconnexion par cookies révoque le refresh token et le jeton d’accès du cookie', async () => {
    const logout = jest.spyOn(authSessionService, 'logout').mockResolvedValue(undefined);
    const accessToken = makeToken({ jti: 'jti-web-admin' });
    const csrf = computeCsrfToken(accessToken);
    const { app } = createRouteTestApp();

    const res = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', [
        `access_token=${accessToken}`,
        'refresh_token=rt-from-cookie',
        `csrf_token=${csrf}`,
      ])
      .set('X-CSRF-Token', csrf)
      .send({});

    expect(res.status).toBe(200);
    expect(logout).toHaveBeenCalledWith('rt-from-cookie', {
      accessJti: 'jti-web-admin',
      accessExpSec: expect.any(Number),
    });
  });
});
