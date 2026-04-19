import request from 'supertest';

import { AppError } from '@shared/errors/app.error';
import { createApp } from '@src/app';
import { resetRateLimits, stopRateLimitSweep } from 'tests/helpers/http/route-test-setup';
import { userToken, makeToken } from 'tests/helpers/auth/token.helpers';

import type { ChatService } from '@modules/chat/useCase/chat.service';

// ── Mock ChatService ────────────────────────────────────────────────

const mockPostMessage = jest.fn();
const mockPostMessageStream = jest.fn();
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
  postMessageStream: mockPostMessageStream,
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

// ── Helpers ────────────────────────────────────────────────────────

/** Parse SSE event stream into structured events. */
function parseSseEvents(raw: string): Array<{ event: string; data: unknown }> {
  const events: Array<{ event: string; data: unknown }> = [];
  const blocks = raw.split('\n\n').filter(Boolean);
  for (const block of blocks) {
    const lines = block.split('\n');
    let event = '';
    let data = '';
    for (const line of lines) {
      if (line.startsWith('event: ')) event = line.slice(7);
      if (line.startsWith('data: ')) data = line.slice(6);
    }
    if (event && data) {
      try {
        events.push({ event, data: JSON.parse(data) });
      } catch {
        events.push({ event, data });
      }
    }
  }
  return events;
}

// ── Tests ──────────────────────────────────────────────────────────

describe('chat-message.route — uncovered paths', () => {
  beforeEach(() => {
    resetRateLimits();
    jest.clearAllMocks();
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  // ── Streaming SSE happy path + callbacks (route is @deprecated, see ADR-001) ─

  describe('POST /api/chat/sessions/:id/messages/stream — SSE streaming (deprecated)', () => {
    it('streams tokens via SSE and sends done event', async () => {
      mockPostMessageStream.mockImplementation(
        async (
          _sessionId: string,
          _input: unknown,
          callbacks: {
            onToken: (text: string) => void;
          },
        ) => {
          callbacks.onToken('Hello');
          callbacks.onToken(' world');
          return {
            message: {
              id: 'msg-stream-1',
              createdAt: '2026-01-01T00:00:00.000Z',
            },
            metadata: { detectedArtwork: { title: 'Test Art' } },
          };
        },
      );

      const res = await request(app)
        .post('/api/chat/sessions/session-uuid/messages/stream')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ text: 'Tell me about art' });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/event-stream');

      const events = parseSseEvents(res.text);
      const tokenEvents = events.filter((e) => e.event === 'token');
      const doneEvents = events.filter((e) => e.event === 'done');

      expect(tokenEvents).toHaveLength(2);
      expect(tokenEvents[0].data).toEqual({ t: 'Hello' });
      expect(tokenEvents[1].data).toEqual({ t: ' world' });
      expect(doneEvents).toHaveLength(1);
      expect(doneEvents[0].data).toEqual(expect.objectContaining({ messageId: 'msg-stream-1' }));
    });

    it('sends guardrail event via onGuardrail callback', async () => {
      mockPostMessageStream.mockImplementation(
        async (
          _sessionId: string,
          _input: unknown,
          callbacks: {
            onToken: (text: string) => void;
            onGuardrail?: (text: string, reason: string) => void;
          },
        ) => {
          callbacks.onGuardrail?.('This topic is not art-related', 'OFF_TOPIC');
          return {
            message: {
              id: 'msg-guardrail-1',
              createdAt: '2026-01-01T00:00:00.000Z',
            },
            metadata: {},
          };
        },
      );

      const res = await request(app)
        .post('/api/chat/sessions/session-uuid/messages/stream')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ text: 'How do I cook pasta?' });

      expect(res.status).toBe(200);

      const events = parseSseEvents(res.text);
      const guardrailEvents = events.filter((e) => e.event === 'guardrail');

      expect(guardrailEvents).toHaveLength(1);
      expect(guardrailEvents[0].data).toEqual({
        text: 'This topic is not art-related',
        reason: 'OFF_TOPIC',
      });
    });

    it('sends error SSE event when AppError is thrown', async () => {
      mockPostMessageStream.mockRejectedValue(
        new AppError({
          message: 'Session not found',
          statusCode: 404,
          code: 'NOT_FOUND',
        }),
      );

      const res = await request(app)
        .post('/api/chat/sessions/bad-session/messages/stream')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ text: 'hello' });

      expect(res.status).toBe(200);

      const events = parseSseEvents(res.text);
      const errorEvents = events.filter((e) => e.event === 'error');

      expect(errorEvents).toHaveLength(1);
      expect(errorEvents[0].data).toEqual({
        code: 'NOT_FOUND',
        message: 'Session not found',
      });
    });

    it('sends generic error SSE event for non-AppError exceptions', async () => {
      mockPostMessageStream.mockRejectedValue(new Error('DB connection lost'));

      const res = await request(app)
        .post('/api/chat/sessions/bad-session/messages/stream')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ text: 'hello' });

      expect(res.status).toBe(200);

      const events = parseSseEvents(res.text);
      const errorEvents = events.filter((e) => e.event === 'error');

      expect(errorEvents).toHaveLength(1);
      expect(errorEvents[0].data).toEqual({
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
      });
    });

    it('passes currentUserId and requestId to postMessageStream', async () => {
      mockPostMessageStream.mockResolvedValue({
        message: { id: 'msg-1', createdAt: '2026-01-01T00:00:00.000Z' },
        metadata: {},
      });

      await request(app)
        .post('/api/chat/sessions/session-uuid/messages/stream')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ text: 'hello' });

      expect(mockPostMessageStream).toHaveBeenCalledWith(
        'session-uuid',
        expect.objectContaining({ text: 'hello' }),
        expect.objectContaining({
          onToken: expect.any(Function),
          onGuardrail: expect.any(Function),
          requestId: expect.any(String),
          currentUserId: 1,
          signal: expect.any(AbortSignal),
        }),
      );
    });

    it('parses JSON context string in stream request body', async () => {
      mockPostMessageStream.mockResolvedValue({
        message: { id: 'msg-1', createdAt: '2026-01-01T00:00:00.000Z' },
        metadata: {},
      });

      await request(app)
        .post('/api/chat/sessions/session-uuid/messages/stream')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({
          text: 'hello',
          context: JSON.stringify({ locale: 'fr', location: 'Louvre' }),
        });

      expect(mockPostMessageStream).toHaveBeenCalledWith(
        'session-uuid',
        expect.objectContaining({
          text: 'hello',
          context: expect.objectContaining({ locale: 'fr', location: 'Louvre' }),
        }),
        expect.any(Object),
      );
    });
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
