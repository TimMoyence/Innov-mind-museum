import request from 'supertest';

import { AppError } from '@shared/errors/app.error';
import { createApp } from '@src/app';
import { resetRateLimits, stopRateLimitSweep } from 'tests/helpers/http/route-test-setup';
import { userToken, makeToken } from 'tests/helpers/auth/token.helpers';

import type { ChatService } from '@modules/chat/useCase/orchestration/chat.service';

// ── Mock ChatService ────────────────────────────────────────────────

const mockPostMessage = jest.fn();
const mockCreateSession = jest.fn();
const mockListSessions = jest.fn();
const mockGetSession = jest.fn();
const mockDeleteSessionIfEmpty = jest.fn();
const mockReportMessage = jest.fn();
const mockGetMessageImageRef = jest.fn();
const mockSetMessageFeedback = jest.fn();
const mockPostAudioMessage = jest.fn();
const mockSynthesizeSpeech = jest.fn();

const mockChatService: Partial<ChatService> = {
  createSession: mockCreateSession,
  listSessions: mockListSessions,
  getSession: mockGetSession,
  deleteSessionIfEmpty: mockDeleteSessionIfEmpty,
  postMessage: mockPostMessage,
  reportMessage: mockReportMessage,
  getMessageImageRef: mockGetMessageImageRef,
  setMessageFeedback: mockSetMessageFeedback,
  postAudioMessage: mockPostAudioMessage,
  synthesizeSpeech: mockSynthesizeSpeech,
};

const app = createApp({
  chatService: mockChatService as ChatService,
  healthCheck: async () => ({ database: 'up' }),
});

// ── Tests ──────────────────────────────────────────────────────────

describe('chat-message.route — uncovered paths', () => {
  beforeEach(() => {
    resetRateLimits();
    jest.clearAllMocks();
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  // ── Non-streaming POST /sessions/:id/messages ──────────────────

  describe('POST /api/chat/sessions/:id/messages — non-streaming path', () => {
    it('returns 201 with assistant reply on success', async () => {
      const result = {
        sessionId: 'session-uuid',
        message: {
          id: 'msg-uuid',
          role: 'assistant',
          text: 'The Mona Lisa is a masterpiece.',
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
    });

    it('forwards AppError from chatService as structured error', async () => {
      mockPostMessage.mockRejectedValueOnce(
        new AppError({
          message: 'Session not found',
          statusCode: 404,
          code: 'NOT_FOUND',
        }),
      );

      const res = await request(app)
        .post('/api/chat/sessions/missing-session/messages')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ text: 'hello' });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('forwards non-AppError as 500', async () => {
      mockPostMessage.mockRejectedValueOnce(new Error('DB exploded'));

      const res = await request(app)
        .post('/api/chat/sessions/session-uuid/messages')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ text: 'hello' });

      expect(res.status).toBe(500);
    });

    it('parses context from JSON string in multipart-like body', async () => {
      mockPostMessage.mockResolvedValueOnce({
        sessionId: 'session-uuid',
        message: {
          id: 'msg-1',
          role: 'assistant',
          text: 'reply',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        metadata: {},
      });

      await request(app)
        .post('/api/chat/sessions/session-uuid/messages')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({
          text: 'hello',
          context: JSON.stringify({ locale: 'de', museumMode: true }),
        });

      expect(mockPostMessage).toHaveBeenCalledWith(
        'session-uuid',
        expect.objectContaining({
          text: 'hello',
          context: expect.objectContaining({ locale: 'de', museumMode: true }),
        }),
        expect.any(String),
        1,
        expect.any(String),
      );
    });

    it('handles image from body as base64', async () => {
      mockPostMessage.mockResolvedValueOnce({
        sessionId: 'session-uuid',
        message: {
          id: 'msg-1',
          role: 'assistant',
          text: 'reply',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        metadata: {},
      });

      await request(app)
        .post('/api/chat/sessions/session-uuid/messages')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ text: 'What is this?', image: 'iVBORw0KGgo...' });

      expect(mockPostMessage).toHaveBeenCalledWith(
        'session-uuid',
        expect.objectContaining({
          image: expect.objectContaining({
            source: 'base64',
            value: 'iVBORw0KGgo...',
          }),
        }),
        expect.any(String),
        1,
        expect.any(String),
      );
    });

    it('handles image URL from body', async () => {
      mockPostMessage.mockResolvedValueOnce({
        sessionId: 'session-uuid',
        message: {
          id: 'msg-1',
          role: 'assistant',
          text: 'reply',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        metadata: {},
      });

      await request(app)
        .post('/api/chat/sessions/session-uuid/messages')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ text: 'What is this?', image: 'https://example.com/painting.jpg' });

      expect(mockPostMessage).toHaveBeenCalledWith(
        'session-uuid',
        expect.objectContaining({
          image: expect.objectContaining({
            source: 'url',
            value: 'https://example.com/painting.jpg',
          }),
        }),
        expect.any(String),
        1,
        expect.any(String),
      );
    });

    it('handles request with no user on req (e.g. anonymous)', async () => {
      const tokenNoSub = makeToken({ sub: undefined });
      mockPostMessage.mockResolvedValueOnce({
        sessionId: 's-1',
        message: {
          id: 'm-1',
          role: 'assistant',
          text: 'ok',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        metadata: {},
      });

      // The auth middleware may reject this; the important thing is we don't crash
      const res = await request(app)
        .post('/api/chat/sessions/session-uuid/messages')
        .set('Authorization', `Bearer ${tokenNoSub}`)
        .send({ text: 'hello' });

      // Either 201 (if auth passes with undefined id) or 401
      expect([201, 401]).toContain(res.status);
    });
  });

  // ── Art keywords endpoints ─────────────────────────────────────

  describe('GET /api/chat/art-keywords — no artKeywordRepo', () => {
    it('returns 404 when artKeywordRepo is not provided', async () => {
      // The app is created without artKeywordRepo, so this should return 404
      const res = await request(app)
        .get('/api/chat/art-keywords')
        .set('Authorization', `Bearer ${userToken()}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('POST /api/chat/art-keywords — no artKeywordRepo', () => {
    it('returns 404 when artKeywordRepo is not provided', async () => {
      const res = await request(app)
        .post('/api/chat/art-keywords')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ keywords: ['monet'] });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });
});
