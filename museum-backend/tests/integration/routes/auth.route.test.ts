import request from 'supertest';
import jwt from 'jsonwebtoken';
import { AppError } from '@shared/errors/app.error';
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
const mockNonceIssue = jest.fn();
const mockExportUserData = jest.fn();
const mockChangePassword = jest.fn();
const mockChangeEmail = jest.fn();
const mockConfirmEmailChange = jest.fn();
const mockVerifyEmail = jest.fn();
const mockCompleteOnboarding = jest.fn();
const mockGetUserById = jest.fn();

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
      login: (...args: unknown[]) => mockLogin(...args),
      refresh: (...args: unknown[]) => mockRefresh(...args),
      logout: (...args: unknown[]) => mockLogout(...args),
    },
    getProfileUseCase: { execute: (...args: unknown[]) => mockGetProfile(...args) },
    deleteAccountUseCase: { execute: (...args: unknown[]) => mockDeleteAccount(...args) },
    forgotPasswordUseCase: { execute: (...args: unknown[]) => mockForgotPassword(...args) },
    resetPasswordUseCase: { execute: (...args: unknown[]) => mockResetPassword(...args) },
    socialLoginUseCase: { execute: (...args: unknown[]) => mockSocialLogin(...args) },
    nonceStore: {
      issue: () => mockNonceIssue(),
      consume: jest.fn(),
    },
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
    userRepository: { getUserById: (...args: unknown[]) => mockGetUserById(...args) },
    wireAuthMiddleware: jest.fn(),
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

    it('GET /api/users/me/export returns 401 without token', async () => {
      const res = await request(app).get('/api/users/me/export');
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
      // 5th arg is the resolved email locale (no body/header → default 'fr')
      expect(mockRegister).toHaveBeenCalledWith('new@test.com', 'ValidPass1', 'Jane', 'Doe', 'fr');
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

    it('GET /api/users/me/export returns user data export', async () => {
      mockGetUserById.mockResolvedValueOnce({ id: 1, email: 'user@test.com', role: 'visitor' });
      const exportResult = {
        exportedAt: '2026-04-26T10:00:00.000Z',
        schemaVersion: '1' as const,
        user: {
          id: 1,
          email: 'user@test.com',
          role: 'visitor',
          createdAt: '2026-01-01',
          lastLoginAt: null,
          locale: 'en',
        },
        consent: { location_to_llm: false },
        chatSessions: [],
        savedArtworks: [],
        reviews: [],
        supportTickets: [],
      };
      mockExportUserData.mockResolvedValueOnce(exportResult);
      const token = makeToken();

      const res = await request(app)
        .get('/api/users/me/export')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(exportResult);
    });
  });

  // ── F1 — Rate-limit /refresh + /social-login ────────────────────
  // Audit 2026-04-30: both endpoints lacked rate-limit middleware. Refresh keyed by IP+familyId
  // (per-family throttle so a stolen family cannot enable >30 rotations/min from one network);
  // social-login keyed by IP+provider (per-provider throttle).

  describe('Rate-limit — F1 /refresh + /social-login', () => {
    const stubRefreshToken = (familyId: string): string => {
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString(
        'base64url',
      );
      const payload = Buffer.from(JSON.stringify({ familyId, sub: '1', type: 'refresh' })).toString(
        'base64url',
      );
      return `${header}.${payload}.signature`;
    };

    it('POST /api/auth/refresh returns 429 after limit exceeded for same IP+family', async () => {
      mockRefresh.mockResolvedValue({ accessToken: 'at', refreshToken: 'rt' });
      const tok = stubRefreshToken('family-A');
      for (let i = 0; i < 30; i += 1) {
        const ok = await request(app).post('/api/auth/refresh').send({ refreshToken: tok });
        expect(ok.status).toBe(200);
      }
      const blocked = await request(app).post('/api/auth/refresh').send({ refreshToken: tok });
      expect(blocked.status).toBe(429);
      expect(blocked.headers['retry-after']).toBeDefined();
    });

    it('POST /api/auth/refresh isolates buckets between different families on same IP', async () => {
      mockRefresh.mockResolvedValue({ accessToken: 'at', refreshToken: 'rt' });
      const famA = stubRefreshToken('family-A');
      const famB = stubRefreshToken('family-B');
      for (let i = 0; i < 30; i += 1) {
        await request(app).post('/api/auth/refresh').send({ refreshToken: famA });
      }
      const stillOk = await request(app).post('/api/auth/refresh').send({ refreshToken: famB });
      expect(stillOk.status).toBe(200);
    });

    it('POST /api/auth/refresh falls back to IP-only key when token is malformed', async () => {
      mockRefresh.mockResolvedValue({ accessToken: 'at', refreshToken: 'rt' });
      for (let i = 0; i < 30; i += 1) {
        const ok = await request(app)
          .post('/api/auth/refresh')
          .send({ refreshToken: 'malformed-string' });
        expect(ok.status).toBe(200);
      }
      const blocked = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'malformed-string' });
      expect(blocked.status).toBe(429);
    });

    it('POST /api/auth/refresh falls back to IP-only key when JWT payload is non-JSON', async () => {
      mockRefresh.mockResolvedValue({ accessToken: 'at', refreshToken: 'rt' });
      // Valid JWT structure (3 segments) but payload base64 decodes to non-JSON → catch branch.
      const header = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url');
      const badPayload = Buffer.from('not-json-text').toString('base64url');
      const malformed = `${header}.${badPayload}.sig`;
      const res = await request(app).post('/api/auth/refresh').send({ refreshToken: malformed });
      expect(res.status).toBe(200);
    });

    it('POST /api/auth/refresh: limiter counts invalid bodies toward IP bucket', async () => {
      // Limiter runs before validateBody so probing with missing refreshToken still drains bucket.
      for (let i = 0; i < 30; i += 1) {
        const res = await request(app).post('/api/auth/refresh').send({});
        expect(res.status).toBe(400);
      }
      const blocked = await request(app).post('/api/auth/refresh').send({});
      expect(blocked.status).toBe(429);
    });

    it('POST /api/auth/social-login returns 429 after limit exceeded for same IP+provider', async () => {
      mockSocialLogin.mockResolvedValue({
        accessToken: 'at',
        refreshToken: 'rt',
        user: { id: 1, email: 'a@b.c' },
      });
      for (let i = 0; i < 10; i += 1) {
        const ok = await request(app)
          .post('/api/auth/social-login')
          .send({ provider: 'google', idToken: 'tok' });
        expect(ok.status).toBe(200);
      }
      const blocked = await request(app)
        .post('/api/auth/social-login')
        .send({ provider: 'google', idToken: 'tok' });
      expect(blocked.status).toBe(429);
      expect(blocked.headers['retry-after']).toBeDefined();
    });

    it('POST /api/auth/social-login isolates buckets between different providers on same IP', async () => {
      mockSocialLogin.mockResolvedValue({
        accessToken: 'at',
        refreshToken: 'rt',
        user: { id: 1, email: 'a@b.c' },
      });
      for (let i = 0; i < 10; i += 1) {
        await request(app)
          .post('/api/auth/social-login')
          .send({ provider: 'google', idToken: 'tok' });
      }
      const stillOk = await request(app)
        .post('/api/auth/social-login')
        .send({ provider: 'apple', idToken: 'tok' });
      expect(stillOk.status).toBe(200);
    });
  });

  // ── F3 — OIDC nonce verification ────────────────────────────────────────
  // Audit 2026-04-30: /social-login accepted any signed ID token, allowing
  // replay if an attacker captured a valid token. Mitigation: server vends
  // a single-use nonce via /social-nonce; client passes it to the social SDK
  // (Apple SHA-256-hashes it); backend asserts the claim and consumes the
  // nonce so a second submission is rejected.

  describe('Nonce — F3 OIDC nonce verification', () => {
    it('POST /api/auth/social-nonce returns a freshly-issued nonce', async () => {
      mockNonceIssue.mockResolvedValueOnce('fresh-nonce-abcdefgh1234567890');
      const res = await request(app).post('/api/auth/social-nonce');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ nonce: 'fresh-nonce-abcdefgh1234567890' });
    });

    it('POST /api/auth/social-login threads the body nonce to the use case', async () => {
      mockSocialLogin.mockResolvedValueOnce({
        accessToken: 'at',
        refreshToken: 'rt',
        user: { id: 7, email: 'nonce@test.com' },
      });
      const nonceValue = 'client-supplied-nonce-1234';

      const res = await request(app).post('/api/auth/social-login').send({
        provider: 'google',
        idToken: 'goog-id-token',
        nonce: nonceValue,
      });

      expect(res.status).toBe(200);
      expect(mockSocialLogin).toHaveBeenCalledWith('google', 'goog-id-token', nonceValue);
    });

    it('POST /api/auth/social-login rejects a nonce shorter than 16 chars (Zod 400)', async () => {
      const res = await request(app).post('/api/auth/social-login').send({
        provider: 'google',
        idToken: 'goog-id-token',
        nonce: 'too-short',
      });
      expect(res.status).toBe(400);
      expect(mockSocialLogin).not.toHaveBeenCalled();
    });

    it('POST /api/auth/social-login surfaces INVALID_NONCE 401 from the use case (replay)', async () => {
      mockSocialLogin.mockRejectedValueOnce(
        new AppError({
          message: 'Invalid or replayed nonce',
          statusCode: 401,
          code: 'INVALID_NONCE',
        }),
      );

      const res = await request(app).post('/api/auth/social-login').send({
        provider: 'google',
        idToken: 'goog-id-token',
        nonce: 'replayed-nonce-1234567',
      });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_NONCE');
    });

    it('POST /api/auth/social-login still accepts requests without nonce (legacy clients)', async () => {
      mockSocialLogin.mockResolvedValueOnce({
        accessToken: 'at',
        refreshToken: 'rt',
        user: { id: 8, email: 'legacy@test.com' },
      });
      const res = await request(app).post('/api/auth/social-login').send({
        provider: 'google',
        idToken: 'goog-id-token',
      });
      expect(res.status).toBe(200);
      expect(mockSocialLogin).toHaveBeenCalledWith('google', 'goog-id-token', undefined);
    });
  });
});
