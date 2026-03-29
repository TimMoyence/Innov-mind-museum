import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '@src/app';
import { env } from '@src/config/env';

/**
 * Admin route integration tests — RBAC enforcement + validation.
 * No DB required — tests that admin routes require authentication and proper role.
 */

const app = createApp({
  healthCheck: async () => ({ database: 'up' }),
});

const makeToken = (overrides: Record<string, unknown> = {}) =>
  jwt.sign(
    { sub: '1', type: 'access', jti: 'test-jti', role: 'visitor', ...overrides },
    env.auth.accessTokenSecret,
    { expiresIn: '5m' },
  );

const adminToken = () => makeToken({ role: 'admin' });
const visitorToken = () => makeToken({ role: 'visitor' });

describe('Admin Routes — RBAC Enforcement', () => {
  describe('Unauthenticated access returns 401', () => {
    it('GET /api/admin/users', async () => {
      const res = await request(app).get('/api/admin/users');
      expect(res.status).toBe(401);
    });

    it('GET /api/admin/audit-logs', async () => {
      const res = await request(app).get('/api/admin/audit-logs');
      expect(res.status).toBe(401);
    });

    it('GET /api/admin/stats', async () => {
      const res = await request(app).get('/api/admin/stats');
      expect(res.status).toBe(401);
    });

    it('GET /api/admin/reports', async () => {
      const res = await request(app).get('/api/admin/reports');
      expect(res.status).toBe(401);
    });

    it('PATCH /api/admin/users/1/role', async () => {
      const res = await request(app).patch('/api/admin/users/1/role').send({ role: 'admin' });
      expect(res.status).toBe(401);
    });

    it('PATCH /api/admin/reports/1', async () => {
      const res = await request(app).patch('/api/admin/reports/1').send({ status: 'reviewed' });
      expect(res.status).toBe(401);
    });

    it('GET /api/admin/analytics/usage', async () => {
      const res = await request(app).get('/api/admin/analytics/usage');
      expect(res.status).toBe(401);
    });

    it('GET /api/admin/analytics/content', async () => {
      const res = await request(app).get('/api/admin/analytics/content');
      expect(res.status).toBe(401);
    });

    it('GET /api/admin/analytics/engagement', async () => {
      const res = await request(app).get('/api/admin/analytics/engagement');
      expect(res.status).toBe(401);
    });

    it('GET /api/admin/tickets', async () => {
      const res = await request(app).get('/api/admin/tickets');
      expect(res.status).toBe(401);
    });

    it('PATCH /api/admin/tickets/1', async () => {
      const res = await request(app).patch('/api/admin/tickets/1').send({ status: 'resolved' });
      expect(res.status).toBe(401);
    });

    it('GET /api/admin/reviews', async () => {
      const res = await request(app).get('/api/admin/reviews');
      expect(res.status).toBe(401);
    });

    it('PATCH /api/admin/reviews/1', async () => {
      const res = await request(app).patch('/api/admin/reviews/1').send({ status: 'approved' });
      expect(res.status).toBe(401);
    });
  });

  // ── Visitor role (non-admin) gets 403 ─────────────────────────────

  describe('Visitor role returns 403 on admin-only routes', () => {
    it('GET /api/admin/users returns 403 for visitor', async () => {
      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${visitorToken()}`);
      expect(res.status).toBe(403);
    });

    it('PATCH /api/admin/users/1/role returns 403 for visitor', async () => {
      const res = await request(app)
        .patch('/api/admin/users/1/role')
        .set('Authorization', `Bearer ${visitorToken()}`)
        .send({ role: 'admin' });
      expect(res.status).toBe(403);
    });

    it('GET /api/admin/audit-logs returns 403 for visitor', async () => {
      const res = await request(app)
        .get('/api/admin/audit-logs')
        .set('Authorization', `Bearer ${visitorToken()}`);
      expect(res.status).toBe(403);
    });

    it('GET /api/admin/stats returns 403 for visitor', async () => {
      const res = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', `Bearer ${visitorToken()}`);
      expect(res.status).toBe(403);
    });

    it('GET /api/admin/reports returns 403 for visitor', async () => {
      const res = await request(app)
        .get('/api/admin/reports')
        .set('Authorization', `Bearer ${visitorToken()}`);
      expect(res.status).toBe(403);
    });

    it('PATCH /api/admin/reports/1 returns 403 for visitor', async () => {
      const res = await request(app)
        .patch('/api/admin/reports/1')
        .set('Authorization', `Bearer ${visitorToken()}`)
        .send({ status: 'reviewed' });
      expect(res.status).toBe(403);
    });

    it('GET /api/admin/analytics/usage returns 403 for visitor', async () => {
      const res = await request(app)
        .get('/api/admin/analytics/usage')
        .set('Authorization', `Bearer ${visitorToken()}`);
      expect(res.status).toBe(403);
    });

    it('GET /api/admin/analytics/content returns 403 for visitor', async () => {
      const res = await request(app)
        .get('/api/admin/analytics/content')
        .set('Authorization', `Bearer ${visitorToken()}`);
      expect(res.status).toBe(403);
    });

    it('GET /api/admin/analytics/engagement returns 403 for visitor', async () => {
      const res = await request(app)
        .get('/api/admin/analytics/engagement')
        .set('Authorization', `Bearer ${visitorToken()}`);
      expect(res.status).toBe(403);
    });

    it('GET /api/admin/tickets returns 403 for visitor', async () => {
      const res = await request(app)
        .get('/api/admin/tickets')
        .set('Authorization', `Bearer ${visitorToken()}`);
      expect(res.status).toBe(403);
    });

    it('PATCH /api/admin/tickets/1 returns 403 for visitor', async () => {
      const res = await request(app)
        .patch('/api/admin/tickets/1')
        .set('Authorization', `Bearer ${visitorToken()}`)
        .send({ status: 'resolved' });
      expect(res.status).toBe(403);
    });

    it('GET /api/admin/reviews returns 403 for visitor', async () => {
      const res = await request(app)
        .get('/api/admin/reviews')
        .set('Authorization', `Bearer ${visitorToken()}`);
      expect(res.status).toBe(403);
    });

    it('PATCH /api/admin/reviews/1 returns 403 for visitor', async () => {
      const res = await request(app)
        .patch('/api/admin/reviews/1')
        .set('Authorization', `Bearer ${visitorToken()}`)
        .send({ status: 'approved' });
      expect(res.status).toBe(403);
    });
  });

  // ── Body validation with admin token ──────────────────────────────

  describe('Body validation on admin routes (with admin token)', () => {
    it('PATCH /api/admin/users/1/role returns 400 for invalid role value', async () => {
      const res = await request(app)
        .patch('/api/admin/users/1/role')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ role: 'superuser' });
      expect(res.status).toBe(400);
    });

    it('PATCH /api/admin/users/1/role returns 400 for empty body', async () => {
      const res = await request(app)
        .patch('/api/admin/users/1/role')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({});
      expect(res.status).toBe(400);
    });

    it('PATCH /api/admin/reports/1 returns 400 for invalid status', async () => {
      const res = await request(app)
        .patch('/api/admin/reports/1')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ status: 'invalid-status' });
      expect(res.status).toBe(400);
    });

    it('PATCH /api/admin/reports/1 returns 400 for empty body', async () => {
      const res = await request(app)
        .patch('/api/admin/reports/1')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({});
      expect(res.status).toBe(400);
    });

    it('PATCH /api/admin/tickets/1 returns 400 for invalid status', async () => {
      const res = await request(app)
        .patch('/api/admin/tickets/1')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ status: 'nonexistent' });
      expect(res.status).toBe(400);
    });

    it('PATCH /api/admin/tickets/1 returns 400 for invalid priority', async () => {
      const res = await request(app)
        .patch('/api/admin/tickets/1')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ priority: 'critical' });
      expect(res.status).toBe(400);
    });

    it('PATCH /api/admin/reviews/1 returns 400 for invalid status', async () => {
      const res = await request(app)
        .patch('/api/admin/reviews/1')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ status: 'pending' });
      expect(res.status).toBe(400);
    });

    it('PATCH /api/admin/reviews/1 returns 400 for empty body', async () => {
      const res = await request(app)
        .patch('/api/admin/reviews/1')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({});
      expect(res.status).toBe(400);
    });
  });

  // ── Error response format ─────────────────────────────────────────

  describe('Error response format', () => {
    it('403 returns structured JSON with error field', async () => {
      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${visitorToken()}`);
      expect(res.status).toBe(403);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toHaveProperty('code', 'FORBIDDEN');
    });
  });
});
