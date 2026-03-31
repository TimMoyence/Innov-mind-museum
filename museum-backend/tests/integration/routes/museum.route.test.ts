import request from 'supertest';
import {
  createRouteTestApp,
  resetRateLimits,
  stopRateLimitSweep,
} from '../../helpers/http/route-test-setup';
import { adminToken, visitorToken } from '../../helpers/auth/token.helpers';

/**
 * Museum route integration tests — auth enforcement + RBAC + validation.
 * No DB required — tests that museum routes require authentication and validate inputs.
 */

const { app } = createRouteTestApp();

describe('Museum Routes — HTTP Layer', () => {
  beforeEach(() => {
    resetRateLimits();
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  // ── Unauthenticated access returns 401 ─────────────────────────

  describe('Unauthenticated access returns 401', () => {
    it('GET /api/museums/directory returns 401 without token', async () => {
      const res = await request(app).get('/api/museums/directory');
      expect(res.status).toBe(401);
    });

    it('POST /api/museums returns 401 without token', async () => {
      const res = await request(app).post('/api/museums').send({ name: 'Test', slug: 'test' });
      expect(res.status).toBe(401);
    });

    it('GET /api/museums returns 401 without token', async () => {
      const res = await request(app).get('/api/museums');
      expect(res.status).toBe(401);
    });

    it('GET /api/museums/:idOrSlug returns 401 without token', async () => {
      const res = await request(app).get('/api/museums/1');
      expect(res.status).toBe(401);
    });

    it('PUT /api/museums/:id returns 401 without token', async () => {
      const res = await request(app).put('/api/museums/1').send({ name: 'Updated' });
      expect(res.status).toBe(401);
    });
  });

  // ── Visitor role (non-admin) RBAC ──────────────────────────────

  describe('Visitor role returns 403 on admin-only museum routes', () => {
    it('POST /api/museums returns 403 for visitor', async () => {
      const res = await request(app)
        .post('/api/museums')
        .set('Authorization', `Bearer ${visitorToken()}`)
        .send({ name: 'Test', slug: 'test' });
      expect(res.status).toBe(403);
    });

    it('GET /api/museums returns 403 for visitor (admin list)', async () => {
      const res = await request(app)
        .get('/api/museums')
        .set('Authorization', `Bearer ${visitorToken()}`);
      expect(res.status).toBe(403);
    });

    it('PUT /api/museums/:id returns 403 for visitor', async () => {
      const res = await request(app)
        .put('/api/museums/1')
        .set('Authorization', `Bearer ${visitorToken()}`)
        .send({ name: 'Updated' });
      expect(res.status).toBe(403);
    });
  });

  // ── Body validation with admin token ───────────────────────────

  describe('Body validation on museum routes (with admin token)', () => {
    it('POST /api/museums returns 400 for empty body', async () => {
      const res = await request(app)
        .post('/api/museums')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({});
      expect(res.status).toBe(400);
    });

    it('POST /api/museums returns 400 for missing slug', async () => {
      const res = await request(app)
        .post('/api/museums')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ name: 'Test Museum' });
      expect(res.status).toBe(400);
    });

    it('POST /api/museums returns 400 for missing name', async () => {
      const res = await request(app)
        .post('/api/museums')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ slug: 'test-museum' });
      expect(res.status).toBe(400);
    });

    it('POST /api/museums returns 400 for name too long (> 200 chars)', async () => {
      const res = await request(app)
        .post('/api/museums')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ name: 'a'.repeat(201), slug: 'test' });
      expect(res.status).toBe(400);
    });

    it('PUT /api/museums/:id returns 400 for name too long', async () => {
      const res = await request(app)
        .put('/api/museums/1')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ name: 'a'.repeat(201) });
      expect(res.status).toBe(400);
    });
  });

  // ── Error response format ──────────────────────────────────────

  describe('Error response format', () => {
    it('401 returns structured JSON with error field', async () => {
      const res = await request(app).get('/api/museums/directory');
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('403 returns structured JSON with FORBIDDEN code', async () => {
      const res = await request(app)
        .post('/api/museums')
        .set('Authorization', `Bearer ${visitorToken()}`)
        .send({ name: 'Test', slug: 'test' });
      expect(res.status).toBe(403);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toHaveProperty('code', 'FORBIDDEN');
    });
  });
});
