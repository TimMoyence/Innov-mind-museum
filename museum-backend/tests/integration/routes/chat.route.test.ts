import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '@src/app';
import { resetRateLimits, stopRateLimitSweep } from '../../helpers/http/route-test-setup';
import { userToken } from '../../helpers/auth/token.helpers';

import type { ChatService } from '@modules/chat/application/chat.service';

// ── Build a mock ChatService for happy-path tests ────────────────────

const mockCreateSession = jest.fn();
const mockListSessions = jest.fn();
const mockGetSession = jest.fn();
const mockDeleteSessionIfEmpty = jest.fn();
const mockPostMessage = jest.fn();
const mockReportMessage = jest.fn();
const mockGetMessageImageRef = jest.fn();
const mockSetMessageFeedback = jest.fn();

const mockChatService: Partial<ChatService> = {
  createSession: mockCreateSession,
  listSessions: mockListSessions,
  getSession: mockGetSession,
  deleteSessionIfEmpty: mockDeleteSessionIfEmpty,
  postMessage: mockPostMessage,
  reportMessage: mockReportMessage,
  getMessageImageRef: mockGetMessageImageRef,
  setMessageFeedback: mockSetMessageFeedback,
};

const app = createApp({
  chatService: mockChatService as ChatService,
  healthCheck: async () => ({ database: 'up' }),
});

/**
 * Chat route integration tests — auth enforcement + basic validation + happy-path handler bodies.
 * No DB required — chat service is mocked via createApp({ chatService }).
 */

describe('Chat Routes — HTTP Layer', () => {
  beforeEach(() => {
    resetRateLimits();
    jest.clearAllMocks();
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

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

  // ── Happy-path handler body coverage ─────────────────────────────

  describe('Happy-path — handler bodies', () => {
    it('POST /api/chat/sessions creates a new session', async () => {
      const session = {
        id: 'session-uuid',
        museumMode: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };
      mockCreateSession.mockResolvedValueOnce(session);

      const res = await request(app)
        .post('/api/chat/sessions')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({});

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ session });
      expect(mockCreateSession).toHaveBeenCalledWith(expect.objectContaining({ userId: 1 }));
    });

    it('POST /api/chat/sessions passes museumId and locale', async () => {
      const session = {
        id: 'session-uuid-2',
        museumMode: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };
      mockCreateSession.mockResolvedValueOnce(session);

      const res = await request(app)
        .post('/api/chat/sessions')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ museumId: 5, locale: 'fr', museumMode: true });

      expect(res.status).toBe(201);
      expect(mockCreateSession).toHaveBeenCalledWith(
        expect.objectContaining({ museumId: 5, museumMode: true }),
      );
    });

    it('GET /api/chat/sessions lists user sessions', async () => {
      const result = {
        sessions: [
          {
            id: 'session-1',
            museumMode: false,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            messageCount: 3,
            preview: { text: 'Hello', createdAt: '2026-01-01T00:00:00.000Z', role: 'user' },
          },
        ],
        page: { nextCursor: null, hasMore: false, limit: 20 },
      };
      mockListSessions.mockResolvedValueOnce(result);

      const res = await request(app)
        .get('/api/chat/sessions')
        .set('Authorization', `Bearer ${userToken()}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(result);
      expect(mockListSessions).toHaveBeenCalledWith(
        expect.objectContaining({}),
        1, // userId from token
      );
    });

    it('GET /api/chat/sessions/:id returns session with messages', async () => {
      const result = {
        session: {
          id: 'session-uuid',
          museumMode: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        messages: [
          {
            id: 'msg-1',
            role: 'user',
            text: 'Hello',
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        page: { nextCursor: null, hasMore: false, limit: 20 },
      };
      mockGetSession.mockResolvedValueOnce(result);

      const res = await request(app)
        .get('/api/chat/sessions/session-uuid')
        .set('Authorization', `Bearer ${userToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.session.id).toBe('session-uuid');
      expect(res.body.messages).toHaveLength(1);
    });

    it('DELETE /api/chat/sessions/:id deletes empty session', async () => {
      const result = { sessionId: 'session-uuid', deleted: true };
      mockDeleteSessionIfEmpty.mockResolvedValueOnce(result);

      const res = await request(app)
        .delete('/api/chat/sessions/session-uuid')
        .set('Authorization', `Bearer ${userToken()}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(result);
      expect(mockDeleteSessionIfEmpty).toHaveBeenCalledWith('session-uuid', 1);
    });

    it('POST /api/chat/sessions/:id/messages posts a message', async () => {
      const result = {
        sessionId: 'session-uuid',
        message: {
          id: 'msg-uuid',
          role: 'assistant',
          text: 'The Mona Lisa was painted by Leonardo da Vinci.',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        metadata: { detectedArtwork: { title: 'Mona Lisa' } },
      };
      mockPostMessage.mockResolvedValueOnce(result);

      const res = await request(app)
        .post('/api/chat/sessions/session-uuid/messages')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ text: 'Tell me about the Mona Lisa' });

      expect(res.status).toBe(201);
      expect(res.body).toEqual(result);
      expect(mockPostMessage).toHaveBeenCalledWith(
        'session-uuid',
        expect.objectContaining({ text: 'Tell me about the Mona Lisa' }),
        expect.any(String), // requestId
        1, // userId
      );
    });

    it('POST /api/chat/messages/:id/report reports a message', async () => {
      const result = { messageId: 'msg-uuid', reported: true };
      mockReportMessage.mockResolvedValueOnce(result);

      const res = await request(app)
        .post('/api/chat/messages/msg-uuid/report')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ reason: 'offensive', comment: 'Inappropriate content' });

      expect(res.status).toBe(201);
      expect(res.body).toEqual(result);
      expect(mockReportMessage).toHaveBeenCalledWith(
        'msg-uuid',
        'offensive',
        1, // userId
        'Inappropriate content',
      );
    });

    it('use case error is forwarded as 500', async () => {
      mockCreateSession.mockRejectedValueOnce(new Error('DB down'));

      const res = await request(app)
        .post('/api/chat/sessions')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({});

      expect(res.status).toBe(500);
    });
  });
});
