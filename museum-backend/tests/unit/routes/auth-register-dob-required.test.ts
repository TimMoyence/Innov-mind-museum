import request from 'supertest';

import {
  createRouteTestApp,
  resetRateLimits,
  stopRateLimitSweep,
} from '../../helpers/http/route-test-setup';

// ── Mock use cases so the register handler executes without a DB ─────────────

const mockRegister = jest.fn();

jest.mock('@modules/auth/useCase', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factory runs before ESM imports
  const jwtLib = require('jsonwebtoken');
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factory runs before ESM imports
  const { env: envConfig } = require('@src/config/env');

  return {
    registerUseCase: { execute: (...args: unknown[]) => mockRegister(...args) },
    authSessionService: {
      verifyAccessToken: (token: string) => {
        const decoded = jwtLib.verify(token, envConfig.auth.accessTokenSecret) as {
          sub: string;
          role?: string;
          museumId?: number;
          type: string;
        };
        if (decoded.type !== 'access' || !decoded.sub) {
          throw new Error('Invalid access token');
        }
        return {
          id: Number(decoded.sub),
          role: decoded.role ?? 'visitor',
          museumId: decoded.museumId ?? null,
        };
      },
      login: jest.fn(),
      refresh: jest.fn(),
      logout: jest.fn(),
    },
    getProfileUseCase: { execute: jest.fn() },
    deleteAccountUseCase: { execute: jest.fn() },
    forgotPasswordUseCase: { execute: jest.fn() },
    resetPasswordUseCase: { execute: jest.fn() },
    socialLoginUseCase: { execute: jest.fn() },
    nonceStore: { issue: jest.fn(), consume: jest.fn() },
    exportUserDataUseCase: { execute: jest.fn() },
    changePasswordUseCase: { execute: jest.fn() },
    changeEmailUseCase: { execute: jest.fn() },
    confirmEmailChangeUseCase: { execute: jest.fn() },
    verifyEmailUseCase: { execute: jest.fn() },
    completeOnboarding: jest.fn(),
    generateApiKeyUseCase: { execute: jest.fn() },
    revokeApiKeyUseCase: { execute: jest.fn() },
    listApiKeysUseCase: { execute: jest.fn() },
    userRepository: { getUserById: jest.fn() },
    wireAuthMiddleware: jest.fn(),
  };
});

jest.mock('@shared/audit', () => ({
  auditService: { log: jest.fn() },
}));

/**
 * RED (UFR-022) — A2 / spec R3.
 * `POST /api/auth/register` MUST reject a body that omits `dateOfBirth` with HTTP
 * 400 (Zod validation) and MUST NOT invoke the register use case. Today the Zod
 * `registerSchema` marks `dateOfBirth` `.optional()`, so the request returns 201
 * and the use case runs — making this suite RED until the schema fix.
 */

const { app } = createRouteTestApp();

describe('POST /api/auth/register — dateOfBirth is required (A2 / R3)', () => {
  beforeEach(() => {
    resetRateLimits();
    jest.clearAllMocks();
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  it('rejects with 400 when dateOfBirth is absent', async () => {
    mockRegister.mockResolvedValueOnce({ id: 99, email: 'nodob@test.com' });

    const res = await request(app).post('/api/auth/register').send({
      email: 'nodob@test.com',
      password: 'ValidPass1',
      firstname: 'No',
      lastname: 'Dob',
    });

    expect(res.status).toBe(400);
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('rejects with 400 when dateOfBirth is an empty string', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'emptydob@test.com',
      password: 'ValidPass1',
      firstname: 'Empty',
      lastname: 'Dob',
      dateOfBirth: '',
    });

    expect(res.status).toBe(400);
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('rejects with 400 when dateOfBirth is not YYYY-MM-DD', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'baddob@test.com',
      password: 'ValidPass1',
      firstname: 'Bad',
      lastname: 'Dob',
      dateOfBirth: '13/06/1990',
    });

    expect(res.status).toBe(400);
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('accepts a valid adult dateOfBirth and creates the user (201)', async () => {
    mockRegister.mockResolvedValueOnce({ id: 7, email: 'adult@test.com' });

    const res = await request(app).post('/api/auth/register').send({
      email: 'adult@test.com',
      password: 'ValidPass1',
      firstname: 'Grown',
      lastname: 'Up',
      dateOfBirth: '1990-06-13',
    });

    expect(res.status).toBe(201);
    expect(mockRegister).toHaveBeenCalledWith(
      expect.objectContaining({ dateOfBirth: '1990-06-13' }),
    );
  });
});
