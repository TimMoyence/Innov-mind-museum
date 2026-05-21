import request from 'supertest';

import {
  createRouteTestApp,
  resetRateLimits,
  stopRateLimitSweep,
} from '../../helpers/http/route-test-setup';
import {
  makeToken,
  adminToken,
  visitorToken,
  superAdminToken,
} from '../../helpers/auth/token.helpers';

// ── Mock use cases so the api-keys handler executes without a DB ─────────────

const mockGenerateApiKey = jest.fn();

jest.mock('@modules/auth/useCase', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factory runs before ESM imports
  const jwtLib = require('jsonwebtoken');
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factory runs before ESM imports
  const { env: envConfig } = require('@src/config/env');

  return {
    registerUseCase: { execute: jest.fn() },
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
    generateApiKeyUseCase: { execute: (...args: unknown[]) => mockGenerateApiKey(...args) },
    revokeApiKeyUseCase: { execute: jest.fn() },
    listApiKeysUseCase: { execute: jest.fn() },
    userRepository: { getUserById: jest.fn() },
    wireAuthMiddleware: jest.fn(),
  };
});

const auditLog = jest.fn();
jest.mock('@shared/audit', () => ({
  auditService: { log: (...args: unknown[]) => auditLog(...args) },
}));

/**
 * RED (UFR-022) — I-SEC4 / spec R6 + R7.
 * `POST /api/auth/api-keys` MUST gate on role: a `visitor` MUST get 403 FORBIDDEN
 * and MUST NOT mint a `msk_` B2B key (no use-case call, no AUDIT_API_KEY_CREATED).
 * `museum_manager` / `admin` / `super_admin` MUST still succeed (201). Today the
 * route is protected only by `isAuthenticatedJwtOnly` + count cap, so a visitor
 * gets 201 — making the R6 case RED until the requireRole gate is added.
 */

const { app } = createRouteTestApp();

const mskResult = {
  plaintext: 'msk_live_abcdef0123456789',
  apiKey: { id: 1, prefix: 'msk_live', name: 'CI key' },
};

beforeEach(() => {
  resetRateLimits();
  jest.clearAllMocks();
  mockGenerateApiKey.mockResolvedValue(mskResult);
});

afterAll(() => {
  stopRateLimitSweep();
});

describe('POST /api/auth/api-keys — role gate (I-SEC4 / R6, R7)', () => {
  it('rejects a visitor with 403 FORBIDDEN and does not mint a key', async () => {
    const res = await request(app)
      .post('/api/auth/api-keys')
      .set('Authorization', `Bearer ${visitorToken()}`)
      .send({ name: 'CI key' });

    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe('FORBIDDEN');
    expect(mockGenerateApiKey).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
  });

  it('allows an admin to mint a key (201)', async () => {
    const res = await request(app)
      .post('/api/auth/api-keys')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ name: 'CI key' });

    expect(res.status).toBe(201);
    expect(res.body.plaintext).toMatch(/^msk_/);
    expect(res.body.apiKey.prefix).toMatch(/^msk_/);
    expect(mockGenerateApiKey).toHaveBeenCalledTimes(1);
  });

  it('allows a museum_manager to mint a key (201)', async () => {
    const res = await request(app)
      .post('/api/auth/api-keys')
      .set('Authorization', `Bearer ${makeToken({ role: 'museum_manager' })}`)
      .send({ name: 'CI key' });

    expect(res.status).toBe(201);
    expect(res.body.plaintext).toMatch(/^msk_/);
    expect(mockGenerateApiKey).toHaveBeenCalledTimes(1);
  });

  it('allows a super_admin to mint a key (201)', async () => {
    const res = await request(app)
      .post('/api/auth/api-keys')
      .set('Authorization', `Bearer ${superAdminToken()}`)
      .send({ name: 'CI key' });

    expect(res.status).toBe(201);
    expect(mockGenerateApiKey).toHaveBeenCalledTimes(1);
  });
});
