import bcrypt from 'bcrypt';
import request from 'supertest';

import { AuthSessionService } from '@modules/auth/useCase/session/authSession.service';

import { makeUser } from '../../helpers/auth/user.fixtures';
import { makeRefreshTokenRepo, makeUserRepo } from '../../helpers/auth/user-repo.mock';
import {
  createRouteTestApp,
  resetRateLimits,
  stopRateLimitSweep,
} from '../../helpers/http/route-test-setup';

jest.mock('@modules/auth/useCase/session/login-rate-limiter', () => ({
  checkLoginRateLimit: jest.fn(),
  recordFailedLogin: jest.fn(),
  clearLoginAttempts: jest.fn(),
}));

describe('RAZ-M1-MFA', () => {
  beforeEach(() => {
    resetRateLimits();
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  it('RAZ-M1-MFA · un admin se connecte et reçoit sa session, sans avertissement ni enrôlement MFA', async () => {
    const userRepo = makeUserRepo();
    const password = await bcrypt.hash('ValidPass1', 1);
    userRepo.getUserByEmail.mockResolvedValue(
      makeUser({ role: 'admin', password, email_verified: true }),
    );
    const service = new AuthSessionService(userRepo, makeRefreshTokenRepo());

    const result = await service.login('user@test.com', 'ValidPass1');

    expect(result).toHaveProperty('accessToken');
    expect(result).not.toHaveProperty('mfaWarningDaysRemaining');
  });

  it('RAZ-M1-MFA · les routes /api/auth/mfa/* n’existent plus et répondent 404', async () => {
    const { app } = createRouteTestApp();

    const response = await request(app).post('/api/auth/mfa/enroll').send({});

    expect(response.status).toBe(404);
  });
});
