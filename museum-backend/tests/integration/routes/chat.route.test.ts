import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '@src/app';
import { env } from '@src/config/env';

/**
 * Chat route integration tests — auth enforcement + basic validation.
 * No DB required — tests that chat routes require authentication and validate inputs.
 * Routes that pass validation but need DB/ChatService will 500 — those are NOT tested here.
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

describe('Chat Routes — HTTP Layer', () => {
  // ── Unauthenticated access returns 401 ─────────────────────────

  describe('Unauthenticated access returns 401', () => {
    it('POST /api/chat/sessions returns 401 without token', async () => {
      const res = await request(app).post('/api/chat/sessions').send({});
      expect(res.status).toBe(401);
    });

    it('GET /api/chat/sessions returns 401 without token', async () => {
      const res = await request(app).get('/api/chat/sessions');
      expect(res.status).toBe(401);
    });

    it('GET /api/chat/sessions/:id returns 401 without token', async () => {
      const res = await request(app).get('/api/chat/sessions/some-uuid');
      expect(res.status).toBe(401);
    });

    it('POST /api/chat/sessions/:id/messages returns 401 without token', async () => {
      const res = await request(app)
        .post('/api/chat/sessions/some-uuid/messages')
        .send({ text: 'hello' });
      expect(res.status).toBe(401);
    });

    it('DELETE /api/chat/sessions/:id returns 401 without token', async () => {
      const res = await request(app).delete('/api/chat/sessions/some-uuid');
      expect(res.status).toBe(401);
    });

    it('POST /api/chat/sessions/:id/audio returns 401 without token', async () => {
      const res = await request(app).post('/api/chat/sessions/some-uuid/audio');
      expect(res.status).toBe(401);
    });

    it('POST /api/chat/messages/:id/report returns 401 without token', async () => {
      const res = await request(app)
        .post('/api/chat/messages/some-uuid/report')
        .send({ reason: 'offensive' });
      expect(res.status).toBe(401);
    });

    it('POST /api/chat/messages/:id/image-url returns 401 without token', async () => {
      const res = await request(app).post('/api/chat/messages/some-uuid/image-url');
      expect(res.status).toBe(401);
    });

    it('GET /api/chat/art-keywords returns 401 without token', async () => {
      const res = await request(app).get('/api/chat/art-keywords');
      expect(res.status).toBe(401);
    });

    it('POST /api/chat/art-keywords returns 401 without token', async () => {
      const res = await request(app)
        .post('/api/chat/art-keywords')
        .send({ keywords: ['test'] });
      expect(res.status).toBe(401);
    });
  });

  // ── Invalid token returns 401 ──────────────────────────────────

  describe('Invalid token returns 401', () => {
    it('returns 401 for token signed with wrong secret', async () => {
      const badToken = jwt.sign({ sub: '1', type: 'access', jti: 'jti' }, 'wrong-secret', {
        expiresIn: '5m',
      });
      const res = await request(app)
        .get('/api/chat/sessions')
        .set('Authorization', `Bearer ${badToken}`);
      expect(res.status).toBe(401);
    });
  });

  // ── POST /api/chat/sessions — validation with auth ─────────────

  describe('POST /api/chat/sessions — validation', () => {
    it('returns 400 for invalid museumId (non-integer)', async () => {
      const res = await request(app)
        .post('/api/chat/sessions')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ museumId: 'abc' });
      expect(res.status).toBe(400);
    });

    it('returns 400 for museumId = 0', async () => {
      const res = await request(app)
        .post('/api/chat/sessions')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ museumId: 0 });
      expect(res.status).toBe(400);
    });

    it('returns 400 for negative museumId', async () => {
      const res = await request(app)
        .post('/api/chat/sessions')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ museumId: -1 });
      expect(res.status).toBe(400);
    });
  });

  // ── POST /api/chat/sessions/:id/messages — validation ──────────

  describe('POST /api/chat/sessions/:id/messages — validation', () => {
    it('accepts well-formed body (will 500 without DB, but not 400)', async () => {
      const res = await request(app)
        .post('/api/chat/sessions/fake-session-id/messages')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ text: 'Tell me about the Mona Lisa' });
      // Should NOT be 400 (validation passes) — will be 500 because no real chatService
      expect(res.status).not.toBe(400);
      expect(res.status).not.toBe(401);
    });

    it('returns 400 for invalid context.guideLevel', async () => {
      const res = await request(app)
        .post('/api/chat/sessions/fake-session-id/messages')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ text: 'hello', context: { guideLevel: 'master' } });
      expect(res.status).toBe(400);
    });

    it('returns 400 for non-object context', async () => {
      const res = await request(app)
        .post('/api/chat/sessions/fake-session-id/messages')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ text: 'hello', context: 'invalid' });
      expect(res.status).toBe(400);
    });
  });

  // ── POST /api/chat/messages/:id/report — validation ────────────

  describe('POST /api/chat/messages/:id/report — validation', () => {
    it('returns 400 for missing reason', async () => {
      const res = await request(app)
        .post('/api/chat/messages/fake-msg-id/report')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({});
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid reason value', async () => {
      const res = await request(app)
        .post('/api/chat/messages/fake-msg-id/report')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ reason: 'spam' });
      expect(res.status).toBe(400);
    });
  });

  // ── Error response format ──────────────────────────────────────

  describe('Error response format', () => {
    it('401 returns structured JSON with error field', async () => {
      const res = await request(app).get('/api/chat/sessions');
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });
});
