import request from 'supertest';

import { authSessionService } from '@modules/auth/useCase';

import {
  createRouteTestApp,
  resetRateLimits,
  stopRateLimitSweep,
} from '../../helpers/http/route-test-setup';

const rotatedSession = {
  accessToken: 'at-rotated',
  refreshToken: 'rt-rotated',
  expiresIn: 900,
  refreshExpiresIn: 86400,
  user: { id: 1, email: 'admin@test.com' },
};

describe('WEB-SESSION-REFRESH', () => {
  beforeEach(() => {
    resetRateLimits();
    jest.restoreAllMocks();
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  it('WEB-SESSION-REFRESH · le web rafraîchit sa session par le seul cookie refresh_token, corps vide', async () => {
    const refresh = jest
      .spyOn(authSessionService, 'refresh')
      .mockResolvedValue(rotatedSession as Awaited<ReturnType<typeof authSessionService.refresh>>);
    const { app } = createRouteTestApp();

    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', 'refresh_token=rt-from-cookie')
      .send({});

    expect(res.status).toBe(200);
    expect(refresh).toHaveBeenCalledWith('rt-from-cookie');
  });

  it('WEB-SESSION-REFRESH · sans corps ni cookie, le refresh reste refusé en 400', async () => {
    const refresh = jest.spyOn(authSessionService, 'refresh');
    const { app } = createRouteTestApp();

    const res = await request(app).post('/api/auth/refresh').send({});

    expect(res.status).toBe(400);
    expect(refresh).not.toHaveBeenCalled();
  });
});
