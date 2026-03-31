import request from 'supertest';
import jwt from 'jsonwebtoken';
import {
  createRouteTestApp,
  resetRateLimits,
  stopRateLimitSweep,
} from '../../helpers/http/route-test-setup';
import { userToken } from '../../helpers/auth/token.helpers';

/**
 * Daily Art route integration tests — auth enforcement + response shape.
 * No DB required — the endpoint serves from a curated in-memory list.
 */

const { app } = createRouteTestApp();

describe('Daily Art Routes — HTTP Layer', () => {
  beforeEach(() => {
    resetRateLimits();
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  // ── Unauthenticated access returns 401 ─────────────────────────

  describe('Unauthenticated access returns 401', () => {
    it('GET /api/daily-art returns 401 without token', async () => {
      const res = await request(app).get('/api/daily-art');
      expect(res.status).toBe(401);
    });

    it('returns 401 for token signed with wrong secret', async () => {
      const badToken = jwt.sign({ sub: '1', type: 'access', jti: 'jti' }, 'wrong-secret', {
        expiresIn: '5m',
      });
      const res = await request(app)
        .get('/api/daily-art')
        .set('Authorization', `Bearer ${badToken}`);
      expect(res.status).toBe(401);
    });
  });

  // ── Authenticated access returns artwork ───────────────────────

  describe('Authenticated access returns artwork', () => {
    it('GET /api/daily-art returns 200 with valid artwork shape', async () => {
      const res = await request(app)
        .get('/api/daily-art')
        .set('Authorization', `Bearer ${userToken()}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('artwork');

      const { artwork } = res.body;
      expect(artwork).toEqual(
        expect.objectContaining({
          title: expect.any(String),
          artist: expect.any(String),
          year: expect.any(String),
          imageUrl: expect.any(String),
          description: expect.any(String),
          funFact: expect.any(String),
          museum: expect.any(String),
        }),
      );
    });

    it('returns exactly 7 fields in the artwork object', async () => {
      const res = await request(app)
        .get('/api/daily-art')
        .set('Authorization', `Bearer ${userToken()}`);

      expect(res.status).toBe(200);
      expect(Object.keys(res.body.artwork)).toHaveLength(7);
    });

    it('returns the same artwork for repeated calls on the same day', async () => {
      const res1 = await request(app)
        .get('/api/daily-art')
        .set('Authorization', `Bearer ${userToken()}`);
      const res2 = await request(app)
        .get('/api/daily-art')
        .set('Authorization', `Bearer ${userToken()}`);

      expect(res1.body.artwork.title).toBe(res2.body.artwork.title);
    });
  });

  // ── Error response format ──────────────────────────────────────

  describe('Error response format', () => {
    it('401 returns structured JSON with error field', async () => {
      const res = await request(app).get('/api/daily-art');
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });
});
