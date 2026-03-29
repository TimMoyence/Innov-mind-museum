import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '@src/app';
import { env } from '@src/config/env';
import {
  clearRateLimitBuckets,
  stopRateLimitSweep,
} from '@src/helpers/middleware/rate-limit.middleware';

/**
 * Auth route integration tests — HTTP layer validation + middleware.
 * Uses createApp() with mock healthCheck. No DB required.
 * Tests focus on: Zod validation (400), authentication (401), routing (404).
 * Routes that pass validation but need DB will 500 — those are NOT tested here.
 *
 * Rate-limit buckets are cleared before each test to prevent 429 bleed-through
 * (all supertest calls share 127.0.0.1 and the in-memory store is a module singleton).
 */

const app = createApp({ healthCheck: async () => ({ database: 'up' }) });

const makeToken = (overrides: Record<string, unknown> = {}) =>
  jwt.sign(
    { sub: '1', type: 'access', jti: 'test-jti', role: 'visitor', ...overrides },
    env.auth.accessTokenSecret,
    { expiresIn: '5m' },
  );

describe('Auth Routes — HTTP Layer', () => {
  beforeEach(() => {
    clearRateLimitBuckets();
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
});
