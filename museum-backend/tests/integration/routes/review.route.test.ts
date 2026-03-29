import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '@src/app';
import { env } from '@src/config/env';
import {
  clearRateLimitBuckets,
  stopRateLimitSweep,
} from '@src/helpers/middleware/rate-limit.middleware';

/**
 * Review route integration tests — auth enforcement + validation.
 * No DB required — tests that review routes require authentication and validate inputs.
 * Note: GET /api/reviews and GET /api/reviews/stats are public (no auth).
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

const userToken = () => makeToken();

describe('Review Routes — HTTP Layer', () => {
  beforeEach(() => {
    clearRateLimitBuckets();
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  // ── Unauthenticated access ─────────────────────────────────────

  describe('Unauthenticated access', () => {
    it('POST /api/reviews returns 401 without token', async () => {
      const res = await request(app)
        .post('/api/reviews')
        .send({ rating: 5, comment: 'Great museum experience!', userName: 'Alice' });
      expect(res.status).toBe(401);
    });

    // GET /api/reviews is public — should NOT return 401
    it('GET /api/reviews does NOT return 401 (public endpoint)', async () => {
      const res = await request(app).get('/api/reviews');
      expect(res.status).not.toBe(401);
    });

    // GET /api/reviews/stats is public
    it('GET /api/reviews/stats does NOT return 401 (public endpoint)', async () => {
      const res = await request(app).get('/api/reviews/stats');
      expect(res.status).not.toBe(401);
    });
  });

  // ── Body validation on POST /api/reviews ───────────────────────

  describe('POST /api/reviews — validation', () => {
    it('returns 400 for empty body', async () => {
      const res = await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({});
      expect(res.status).toBe(400);
    });

    it('returns 400 for missing rating', async () => {
      const res = await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ comment: 'Nice place to visit', userName: 'Bob' });
      expect(res.status).toBe(400);
    });

    it('returns 400 for rating out of range (0)', async () => {
      const res = await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ rating: 0, comment: 'Some comment here.', userName: 'Bob' });
      expect(res.status).toBe(400);
    });

    it('returns 400 for rating out of range (6)', async () => {
      const res = await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ rating: 6, comment: 'Some comment here.', userName: 'Bob' });
      expect(res.status).toBe(400);
    });

    it('returns 400 for comment too short (< 10 chars)', async () => {
      const res = await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ rating: 4, comment: 'Short', userName: 'Bob' });
      expect(res.status).toBe(400);
    });

    it('returns 400 for missing userName', async () => {
      const res = await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ rating: 4, comment: 'A sufficiently long comment' });
      expect(res.status).toBe(400);
    });

    it('returns 400 for non-integer rating', async () => {
      const res = await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ rating: 3.5, comment: 'A sufficiently long comment', userName: 'Bob' });
      expect(res.status).toBe(400);
    });
  });

  // ── Error response format ──────────────────────────────────────

  describe('Error response format', () => {
    it('401 returns structured JSON with error field', async () => {
      const res = await request(app).post('/api/reviews').send({});
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('400 validation returns structured JSON with error field', async () => {
      const res = await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({});
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toHaveProperty('message');
    });
  });
});
