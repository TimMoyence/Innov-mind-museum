import request from 'supertest';
import jwt from 'jsonwebtoken';
import {
  createRouteTestApp,
  resetRateLimits,
  stopRateLimitSweep,
} from '../../helpers/http/route-test-setup';
import { makeToken } from '../../helpers/auth/token.helpers';

// ── Mock use cases so handlers execute without DB ────────────────────

const mockRegister = jest.fn();
const mockLogin = jest.fn();
const mockRefresh = jest.fn();
const mockLogout = jest.fn();
const mockGetProfile = jest.fn();
const mockDeleteAccount = jest.fn();
const mockForgotPassword = jest.fn();
const mockResetPassword = jest.fn();
const mockSocialLogin = jest.fn();
const mockExportUserData = jest.fn();
const mockChangePassword = jest.fn();
const mockChangeEmail = jest.fn();
const mockConfirmEmailChange = jest.fn();
const mockVerifyEmail = jest.fn();
const mockCompleteOnboarding = jest.fn();

jest.mock('@modules/auth/core/useCase', () => {
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
      login: (...args: unknown[]) => mockLogin(...args),
      refresh: (...args: unknown[]) => mockRefresh(...args),
      logout: (...args: unknown[]) => mockLogout(...args),
    },
    getProfileUseCase: { execute: (...args: unknown[]) => mockGetProfile(...args) },
    deleteAccountUseCase: { execute: (...args: unknown[]) => mockDeleteAccount(...args) },
    forgotPasswordUseCase: { execute: (...args: unknown[]) => mockForgotPassword(...args) },
    resetPasswordUseCase: { execute: (...args: unknown[]) => mockResetPassword(...args) },
    socialLoginUseCase: { execute: (...args: unknown[]) => mockSocialLogin(...args) },
    exportUserDataUseCase: { execute: (...args: unknown[]) => mockExportUserData(...args) },
    changePasswordUseCase: { execute: (...args: unknown[]) => mockChangePassword(...args) },
    changeEmailUseCase: { execute: (...args: unknown[]) => mockChangeEmail(...args) },
    confirmEmailChangeUseCase: {
      execute: (...args: unknown[]) => mockConfirmEmailChange(...args),
    },
    verifyEmailUseCase: { execute: (...args: unknown[]) => mockVerifyEmail(...args) },
    completeOnboarding: (...args: unknown[]) => mockCompleteOnboarding(...args),
    generateApiKeyUseCase: { execute: jest.fn() },
    revokeApiKeyUseCase: { execute: jest.fn() },
    listApiKeysUseCase: { execute: jest.fn() },
  };
});

jest.mock('@shared/audit', () => ({
  auditService: { log: jest.fn() },
}));

/**
 * Auth route integration tests — HTTP layer validation + middleware + happy-path handler bodies.
 * Uses createApp() with mock healthCheck. No DB required — use cases are mocked.
 *
 * Rate-limit buckets are cleared before each test to prevent 429 bleed-through
 * (all supertest calls share 127.0.0.1 and the in-memory store is a module singleton).
 */

const { app } = createRouteTestApp();

describe('Auth Routes — HTTP Layer', () => {
  beforeEach(() => {
    resetRateLimits();
    jest.clearAllMocks();
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  // ── POST /api/auth/register — Zod validation rejects ───────────

  describe('POST /api/auth/register', () => {
    it('returns 400 for empty body', async () => {
      const res = await request(app).post('/api/auth/register').send({});
      expect(res.status).toBe(400);
    });

    it('returns 400 for missing email', async () => {
      const res = await request(app).post('/api/auth/register').send({
        password: 'ValidPass1',
        firstname: 'Test',
        lastname: 'User',
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid email format', async () => {
      const res = await request(app).post('/api/auth/register').send({
        email: 'not-an-email',
        password: 'ValidPass1',
        firstname: 'Test',
        lastname: 'User',
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 for password too short (< 8 chars)', async () => {
      const res = await request(app).post('/api/auth/register').send({
        email: 'test@example.com',
        password: 'short',
        firstname: 'Test',
        lastname: 'User',
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 for password too long (> 128 chars)', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: 'a'.repeat(129),
          firstname: 'Test',
          lastname: 'User',
        });
      expect(res.status).toBe(400);
    });
  });

  // ── POST /api/auth/login — Zod validation rejects ──────────────

  describe('POST /api/auth/login', () => {
    it('returns 400 for empty body', async () => {
      const res = await request(app).post('/api/auth/login').send({});
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid email format', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'bad-email',
        password: 'password123',
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 for missing password', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'test@example.com',
      });
      expect(res.status).toBe(400);
    });
  });

  // ── POST /api/auth/refresh — Zod validation rejects ────────────

  describe('POST /api/auth/refresh', () => {
    it('returns 400 for empty body', async () => {
      const res = await request(app).post('/api/auth/refresh').send({});
      expect(res.status).toBe(400);
    });

    it('returns 400 for missing refreshToken', async () => {
      const res = await request(app).post('/api/auth/refresh').send({
        wrongField: 'token',
      });
      expect(res.status).toBe(400);
    });
  });

  // ── POST /api/auth/social-login — Zod validation rejects ────────

  describe('POST /api/auth/social-login', () => {
    it('returns 400 for empty body', async () => {
      const res = await request(app).post('/api/auth/social-login').send({});
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid provider', async () => {
      const res = await request(app).post('/api/auth/social-login').send({
        provider: 'facebook',
        idToken: 'some-token',
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 for missing idToken', async () => {
      const res = await request(app).post('/api/auth/social-login').send({
        provider: 'google',
      });
      expect(res.status).toBe(400);
    });
  });

  // ── POST /api/auth/forgot-password — Zod validation rejects ────

  describe('POST /api/auth/forgot-password', () => {
    it('returns 400 for empty body', async () => {
      const res = await request(app).post('/api/auth/forgot-password').send({});
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid email format', async () => {
      const res = await request(app).post('/api/auth/forgot-password').send({
        email: 'not-valid',
      });
      expect(res.status).toBe(400);
    });
  });

  // ── POST /api/auth/reset-password — Zod validation rejects ─────

  describe('POST /api/auth/reset-password', () => {
    it('returns 400 for empty body', async () => {
      const res = await request(app).post('/api/auth/reset-password').send({});
      expect(res.status).toBe(400);
    });

    it('returns 400 for missing token', async () => {
      const res = await request(app).post('/api/auth/reset-password').send({
        newPassword: 'ValidPass1',
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 for password too short', async () => {
      const res = await request(app).post('/api/auth/reset-password').send({
        token: 'some-reset-token',
        newPassword: 'short',
      });
      expect(res.status).toBe(400);
    });
  });

  // ── POST /api/auth/verify-email — Zod validation rejects ───────

  describe('POST /api/auth/verify-email', () => {
    it('returns 400 for empty body', async () => {
      const res = await request(app).post('/api/auth/verify-email').send({});
      expect(res.status).toBe(400);
    });

    it('returns 400 for missing token', async () => {
      const res = await request(app).post('/api/auth/verify-email').send({
        wrongField: 'value',
      });
      expect(res.status).toBe(400);
    });
  });

  // ── POST /api/auth/confirm-email-change — Zod validation rejects

  describe('POST /api/auth/confirm-email-change', () => {
    it('returns 400 for empty body', async () => {
      const res = await request(app).post('/api/auth/confirm-email-change').send({});
      expect(res.status).toBe(400);
    });
  });

  // ── Protected routes — auth middleware returns 401 ──────────────

  describe('Protected routes require authentication', () => {
    it('GET /api/auth/me returns 401 without token', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
    });

    it('DELETE /api/auth/account returns 401 without token', async () => {
      const res = await request(app).delete('/api/auth/account');
      expect(res.status).toBe(401);
    });

    it('GET /api/auth/export-data returns 401 without token', async () => {
      const res = await request(app).get('/api/auth/export-data');
      expect(res.status).toBe(401);
    });

    it('PUT /api/auth/change-password returns 401 without token', async () => {
      const res = await request(app).put('/api/auth/change-password').send({
        currentPassword: 'old',
        newPassword: 'newValid1',
      });
      expect(res.status).toBe(401);
    });

    it('PUT /api/auth/change-email returns 401 without token', async () => {
      const res = await request(app).put('/api/auth/change-email').send({
        newEmail: 'new@example.com',
        currentPassword: 'pass',
      });
      expect(res.status).toBe(401);
    });

    it('PATCH /api/auth/onboarding-complete returns 401 without token', async () => {
      const res = await request(app).patch('/api/auth/onboarding-complete');
      expect(res.status).toBe(401);
    });

    it('returns 401 for invalid/expired token', async () => {
      const badToken = jwt.sign({ sub: '1', type: 'access', jti: 'jti' }, 'wrong-secret', {
        expiresIn: '5m',
      });
      const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${badToken}`);
      expect(res.status).toBe(401);
    });
  });

  // ── Authenticated validation — 400 with valid token ─────────────

  describe('Authenticated routes still validate body', () => {
    it('PUT /api/auth/change-password returns 400 for missing fields with valid token', async () => {
      const token = makeToken();
      const res = await request(app)
        .put('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(res.status).toBe(400);
    });

    it('PUT /api/auth/change-password returns 400 for newPassword too short', async () => {
      const token = makeToken();
      const res = await request(app)
        .put('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'oldpass', newPassword: 'short' });
      expect(res.status).toBe(400);
    });

    it('PUT /api/auth/change-email returns 400 for invalid email with valid token', async () => {
      const token = makeToken();
      const res = await request(app)
        .put('/api/auth/change-email')
        .set('Authorization', `Bearer ${token}`)
        .send({ newEmail: 'bad-email', currentPassword: 'pass' });
      expect(res.status).toBe(400);
    });
  });

  // ── Error response format ──────────────────────────────────────

  describe('Error response format', () => {
    it('validation error returns structured JSON with error field', async () => {
      const res = await request(app).post('/api/auth/refresh').send({});
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toHaveProperty('message');
    });

    it('401 returns structured JSON', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
    });
  });

  // ── Health endpoint ─────────────────────────────────────────────

  describe('GET /api/health', () => {
    it('returns 200 with mocked health check', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status');
    });
  });

  // ── 404 fallback ────────────────────────────────────────────────

  describe('Unknown routes', () => {
    it('returns 404 for unknown API routes', async () => {
      const res = await request(app).get('/api/nonexistent');
      expect(res.status).toBe(404);
    });
  });

  // ── Happy-path handler body coverage ─────────────────────────────

  describe('Happy-path — handler bodies', () => {
    it('POST /api/auth/register creates user and returns 201', async () => {
      mockRegister.mockResolvedValueOnce({ id: 42, email: 'new@test.com' });

      const res = await request(app).post('/api/auth/register').send({
        email: 'new@test.com',
        password: 'ValidPass1',
        firstname: 'Jane',
        lastname: 'Doe',
      });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ user: { id: 42, email: 'new@test.com' } });
      expect(mockRegister).toHaveBeenCalledWith('new@test.com', 'ValidPass1', 'Jane', 'Doe');
    });

    it('POST /api/auth/login returns access and refresh tokens', async () => {
      const session = {
        accessToken: 'at-123',
        refreshToken: 'rt-456',
        user: { id: 1, email: 'user@test.com' },
      };
      mockLogin.mockResolvedValueOnce(session);

      const res = await request(app).post('/api/auth/login').send({
        email: 'user@test.com',
        password: 'ValidPass1',
      });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(session);
    });

    it('POST /api/auth/refresh rotates refresh token', async () => {
      const session = { accessToken: 'at-new', refreshToken: 'rt-new' };
      mockRefresh.mockResolvedValueOnce(session);

      const res = await request(app).post('/api/auth/refresh').send({
        refreshToken: 'rt-old',
      });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(session);
    });

    it('POST /api/auth/logout returns success', async () => {
      mockLogout.mockResolvedValueOnce(undefined);

      const res = await request(app).post('/api/auth/logout').send({
        refreshToken: 'rt-to-invalidate',
      });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
    });

    it('GET /api/auth/me returns user profile', async () => {
      const profile = {
        id: 1,
        email: 'user@test.com',
        firstname: 'Test',
        lastname: 'User',
        role: 'visitor',
        onboardingCompleted: false,
      };
      mockGetProfile.mockResolvedValueOnce(profile);
      const token = makeToken();

      const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.user).toEqual({
        id: 1,
        email: 'user@test.com',
        firstname: 'Test',
        lastname: 'User',
        role: 'visitor',
        onboardingCompleted: false,
      });
    });

    it('GET /api/auth/me returns 401 when profile not found', async () => {
      mockGetProfile.mockResolvedValueOnce(null);
      const token = makeToken();

      const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(401);
    });

    it('DELETE /api/auth/account deletes user and returns 200', async () => {
      mockDeleteAccount.mockResolvedValueOnce(undefined);
      const token = makeToken();

      const res = await request(app)
        .delete('/api/auth/account')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ deleted: true });
    });

    it('POST /api/auth/forgot-password returns message', async () => {
      mockForgotPassword.mockResolvedValueOnce('debug-token-123');

      const res = await request(app).post('/api/auth/forgot-password').send({
        email: 'user@test.com',
      });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('reset link');
    });

    it('POST /api/auth/reset-password resets password', async () => {
      mockResetPassword.mockResolvedValueOnce(undefined);

      const res = await request(app).post('/api/auth/reset-password').send({
        token: 'reset-token-abc',
        newPassword: 'NewValidPass1',
      });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('Password updated');
    });

    it('POST /api/auth/verify-email verifies email', async () => {
      const result = { message: 'Email verified' };
      mockVerifyEmail.mockResolvedValueOnce(result);

      const res = await request(app).post('/api/auth/verify-email').send({
        token: 'verify-token-xyz',
      });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(result);
    });

    it('POST /api/auth/confirm-email-change confirms email change', async () => {
      const result = { message: 'Email changed' };
      mockConfirmEmailChange.mockResolvedValueOnce(result);

      const res = await request(app).post('/api/auth/confirm-email-change').send({
        token: 'change-token-xyz',
      });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(result);
    });

    it('POST /api/auth/social-login returns session', async () => {
      const session = {
        accessToken: 'at-social',
        refreshToken: 'rt-social',
        user: { id: 5, email: 'social@test.com' },
      };
      mockSocialLogin.mockResolvedValueOnce(session);

      const res = await request(app).post('/api/auth/social-login').send({
        provider: 'google',
        idToken: 'google-id-token',
      });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(session);
    });

    it('PUT /api/auth/change-password changes password', async () => {
      mockChangePassword.mockResolvedValueOnce(undefined);
      const token = makeToken();

      const res = await request(app)
        .put('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'OldPass123', newPassword: 'NewPass456' });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('Password changed');
    });

    it('PATCH /api/auth/onboarding-complete returns 204', async () => {
      mockCompleteOnboarding.mockResolvedValueOnce(undefined);
      const token = makeToken();

      const res = await request(app)
        .patch('/api/auth/onboarding-complete')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(204);
    });

    it('GET /api/auth/export-data returns user data export', async () => {
      mockGetProfile.mockResolvedValueOnce({
        id: 1,
        email: 'user@test.com',
        firstname: 'Test',
        lastname: 'User',
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-02'),
      });
      const exportResult = { user: { id: 1, email: 'user@test.com' }, sessions: [] };
      mockExportUserData.mockResolvedValueOnce(exportResult);
      const token = makeToken();

      const res = await request(app)
        .get('/api/auth/export-data')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(exportResult);
    });

    it('GET /api/auth/export-data returns 404 when user not found', async () => {
      mockGetProfile.mockResolvedValueOnce(null);
      const token = makeToken();

      const res = await request(app)
        .get('/api/auth/export-data')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });
  });
});
