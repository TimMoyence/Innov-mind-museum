import request from 'supertest';

import { authSessionService } from '@modules/auth/useCase';

import {
  createRouteTestApp,
  resetRateLimits,
  stopRateLimitSweep,
} from '../../helpers/http/route-test-setup';

describe('AUTH-LOGOUT-RATE-LIMIT', () => {
  beforeEach(() => {
    resetRateLimits();
    jest.restoreAllMocks();
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  it('AUTH-LOGOUT-RATE-LIMIT · la 31e déconnexion d’une même IP dans la minute est refusée en 429 sans toucher la session', async () => {
    const logout = jest.spyOn(authSessionService, 'logout').mockResolvedValue(undefined);
    const { app } = createRouteTestApp();

    const statuses: number[] = [];
    for (let attempt = 0; attempt < 31; attempt += 1) {
      const res = await request(app).post('/api/auth/logout').send({ refreshToken: 'rt' });
      statuses.push(res.status);
    }

    expect(statuses.slice(0, 30).every((status) => status === 200)).toBe(true);
    expect(statuses[30]).toBe(429);
    expect(logout).toHaveBeenCalledTimes(30);
  });
});
