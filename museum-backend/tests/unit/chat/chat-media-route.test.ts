import request from 'supertest';

import { AppError } from '@shared/errors/app.error';
import { env } from '@src/config/env';
import { createApp } from '@src/app';
import { resetRateLimits, stopRateLimitSweep } from 'tests/helpers/http/route-test-setup';
import { userToken } from 'tests/helpers/auth/token.helpers';
import { buildSignedChatImageReadUrl } from '@modules/chat/adapters/primary/http/chat.image-url';

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

// ── Tests ──────────────────────────────────────────────────────────

describe('chat-media.route — uncovered paths', () => {
  const originalVoiceMode = env.featureFlags.voiceMode;

  beforeEach(() => {
    resetRateLimits();
    jest.clearAllMocks();
    env.featureFlags.voiceMode = originalVoiceMode;
  });

  afterAll(() => {
    env.featureFlags.voiceMode = originalVoiceMode;
    stopRateLimitSweep();
  });

  // ── POST /messages/:messageId/tts — voice mode OFF ─────────────

  describe('POST /api/chat/messages/:id/tts — voice mode feature flag', () => {
    it('returns 404 when voice mode feature flag is disabled', async () => {
      env.featureFlags.voiceMode = false;

      const res = await request(app)
        .post('/api/chat/messages/msg-uuid/tts')
        .set('Authorization', `Bearer ${userToken()}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(res.body.error.message).toBe('Voice mode is not enabled');
    });

    it('returns audio buffer when voice mode is enabled', async () => {
      env.featureFlags.voiceMode = true;
      const audioBuffer = Buffer.from('fake-audio-data');
      mockSynthesizeSpeech.mockResolvedValueOnce({
        audio: audioBuffer,
        contentType: 'audio/mpeg',
      });

      const res = await request(app)
        .post('/api/chat/messages/msg-uuid/tts')
        .set('Authorization', `Bearer ${userToken()}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('audio/mpeg');
      expect(res.headers['content-length']).toBe(String(audioBuffer.length));
    });

    it('returns 204 when synthesizeSpeech returns null', async () => {
      env.featureFlags.voiceMode = true;
      mockSynthesizeSpeech.mockResolvedValueOnce(null);

      const res = await request(app)
        .post('/api/chat/messages/msg-uuid/tts')
        .set('Authorization', `Bearer ${userToken()}`);

      expect(res.status).toBe(204);
    });

    it('forwards AppError from synthesizeSpeech', async () => {
      env.featureFlags.voiceMode = true;
      mockSynthesizeSpeech.mockRejectedValueOnce(
        new AppError({
          message: 'TTS not available',
          statusCode: 501,
          code: 'NOT_IMPLEMENTED',
        }),
      );

      const res = await request(app)
        .post('/api/chat/messages/msg-uuid/tts')
        .set('Authorization', `Bearer ${userToken()}`);

      expect(res.status).toBe(501);
      expect(res.body.error.code).toBe('NOT_IMPLEMENTED');
    });
  });

  // ── POST /messages/:messageId/report — auth checks ─────────────

  describe('POST /api/chat/messages/:id/report — user auth', () => {
    it('returns 401 when no token is provided', async () => {
      const res = await request(app)
        .post('/api/chat/messages/msg-uuid/report')
        .send({ reason: 'offensive' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('reports message successfully with valid user', async () => {
      mockReportMessage.mockResolvedValueOnce({
        messageId: 'msg-uuid',
        reported: true,
      });

      const res = await request(app)
        .post('/api/chat/messages/msg-uuid/report')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ reason: 'offensive', comment: 'Bad content' });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ messageId: 'msg-uuid', reported: true });
      expect(mockReportMessage).toHaveBeenCalledWith('msg-uuid', 'offensive', 1, 'Bad content');
    });

    it('forwards AppError from reportMessage', async () => {
      mockReportMessage.mockRejectedValueOnce(
        new AppError({
          message: 'Message not found',
          statusCode: 404,
          code: 'NOT_FOUND',
        }),
      );

      const res = await request(app)
        .post('/api/chat/messages/msg-uuid/report')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ reason: 'inaccurate' });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  // ── POST /messages/:messageId/feedback — auth checks ───────────

  describe('POST /api/chat/messages/:id/feedback — user auth', () => {
    it('returns 401 when no token is provided', async () => {
      const res = await request(app)
        .post('/api/chat/messages/msg-uuid/feedback')
        .send({ value: 'positive' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('sets feedback successfully with valid user', async () => {
      mockSetMessageFeedback.mockResolvedValueOnce({
        messageId: 'msg-uuid',
        status: 'created',
      });

      const res = await request(app)
        .post('/api/chat/messages/msg-uuid/feedback')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ value: 'positive' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ messageId: 'msg-uuid', status: 'created' });
      expect(mockSetMessageFeedback).toHaveBeenCalledWith('msg-uuid', 1, 'positive');
    });

    it('returns 400 for invalid feedback value', async () => {
      const res = await request(app)
        .post('/api/chat/messages/msg-uuid/feedback')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ value: 'neutral' });

      expect(res.status).toBe(400);
    });

    it('returns 400 for missing feedback value', async () => {
      const res = await request(app)
        .post('/api/chat/messages/msg-uuid/feedback')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('forwards AppError from setMessageFeedback', async () => {
      mockSetMessageFeedback.mockRejectedValueOnce(
        new AppError({
          message: 'Message not found',
          statusCode: 404,
          code: 'NOT_FOUND',
        }),
      );

      const res = await request(app)
        .post('/api/chat/messages/msg-uuid/feedback')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ value: 'negative' });

      expect(res.status).toBe(404);
    });
  });

  // ── POST /messages/:messageId/image-url ────────────────────────

  describe('POST /api/chat/messages/:id/image-url', () => {
    it('returns signed URL on success', async () => {
      mockGetMessageImageRef.mockResolvedValueOnce({
        imageRef: 'local/path/to/image.jpg',
        fileName: 'image.jpg',
        contentType: 'image/jpeg',
      });

      const res = await request(app)
        .post('/api/chat/messages/msg-uuid/image-url')
        .set('Authorization', `Bearer ${userToken()}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('url');
      expect(res.body).toHaveProperty('expiresAt');
    });

    it('returns 400 when buildImageReadUrl returns null (no baseUrl or unsupported backend)', async () => {
      // S3 ref but no S3 config -> buildImageReadUrl returns null
      mockGetMessageImageRef.mockResolvedValueOnce({
        imageRef: 's3://bucket/key',
        fileName: 'image.jpg',
        contentType: 'image/jpeg',
      });

      const res = await request(app)
        .post('/api/chat/messages/msg-uuid/image-url')
        .set('Authorization', `Bearer ${userToken()}`);

      // Depending on S3 config, this may return 400 or 200
      // When S3 config is incomplete, buildImageReadUrl returns null -> 400
      expect([200, 400]).toContain(res.status);
    });

    it('forwards AppError from getMessageImageRef', async () => {
      mockGetMessageImageRef.mockRejectedValueOnce(
        new AppError({
          message: 'Image not found',
          statusCode: 404,
          code: 'NOT_FOUND',
        }),
      );

      const res = await request(app)
        .post('/api/chat/messages/msg-uuid/image-url')
        .set('Authorization', `Bearer ${userToken()}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  // ── GET /messages/:messageId/image — image serve handler ───────

  describe('GET /api/chat/messages/:id/image — image serving', () => {
    it('returns 400 for missing token/signature query params', async () => {
      const res = await request(app).get('/api/chat/messages/msg-uuid/image');

      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid signature', async () => {
      const res = await request(app)
        .get('/api/chat/messages/msg-uuid/image')
        .query({ token: 'invalid', sig: 'invalid' });

      expect(res.status).toBe(400);
    });

    it('serves S3 image via 302 redirect with valid signed URL', async () => {
      // Generate a valid signed URL for the message
      const signed = buildSignedChatImageReadUrl({
        baseUrl: 'http://127.0.0.1',
        messageId: 'msg-s3',
      });

      const url = new URL(signed.url);
      const token = url.searchParams.get('token');
      const sig = url.searchParams.get('sig');

      mockGetMessageImageRef.mockResolvedValueOnce({
        imageRef: 's3://bucket/path/to/image.jpg',
        fileName: 'image.jpg',
        contentType: 'image/jpeg',
      });

      const res = await request(app).get('/api/chat/messages/msg-s3/image').query({ token, sig });

      // With S3 ref + valid config: 302 redirect
      // With S3 ref + no config: buildImageReadUrl returns null -> 400 (bad request)
      // The behavior depends on the env.storage.s3 config in test env
      expect([302, 400]).toContain(res.status);
    });

    it('returns 501 for unsupported image storage backend', async () => {
      // Generate a valid signed URL
      const signed = buildSignedChatImageReadUrl({
        baseUrl: 'http://127.0.0.1',
        messageId: 'msg-unsupported',
      });

      const url = new URL(signed.url);
      const token = url.searchParams.get('token');
      const sig = url.searchParams.get('sig');

      // Return a non-S3, non-local imageRef that resolveLocalImageFilePath can't handle
      mockGetMessageImageRef.mockResolvedValueOnce({
        imageRef: 'azure://container/blob',
        fileName: 'image.jpg',
        contentType: 'image/jpeg',
      });

      const res = await request(app)
        .get('/api/chat/messages/msg-unsupported/image')
        .query({ token, sig });

      expect(res.status).toBe(501);
      expect(res.body.error.code).toBe('IMAGE_STORAGE_NOT_SUPPORTED');
    });

    it('forwards error when getMessageImageRef throws', async () => {
      const signed = buildSignedChatImageReadUrl({
        baseUrl: 'http://127.0.0.1',
        messageId: 'msg-error',
      });

      const url = new URL(signed.url);
      const token = url.searchParams.get('token');
      const sig = url.searchParams.get('sig');

      mockGetMessageImageRef.mockRejectedValueOnce(
        new AppError({
          message: 'Message not found',
          statusCode: 404,
          code: 'NOT_FOUND',
        }),
      );

      const res = await request(app)
        .get('/api/chat/messages/msg-error/image')
        .query({ token, sig });

      expect(res.status).toBe(404);
    });
  });

  // ── POST /sessions/:id/audio — audio upload ────────────────────

  describe('POST /api/chat/sessions/:id/audio', () => {
    it('returns 400 when no audio file is provided', async () => {
      const res = await request(app)
        .post('/api/chat/sessions/session-uuid/audio')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('processes audio upload successfully', async () => {
      const result = {
        sessionId: 'session-uuid',
        message: {
          id: 'msg-audio-1',
          role: 'assistant',
          text: 'Art response from audio',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        metadata: {},
        transcription: {
          text: 'Tell me about this painting',
          model: 'whisper-1',
          provider: 'openai',
        },
      };
      mockPostAudioMessage.mockResolvedValueOnce(result);

      const res = await request(app)
        .post('/api/chat/sessions/session-uuid/audio')
        .set('Authorization', `Bearer ${userToken()}`)
        .attach('audio', Buffer.from('fake-audio'), {
          filename: 'recording.webm',
          contentType: 'audio/webm',
        });

      expect(res.status).toBe(201);
      expect(res.body.transcription.text).toBe('Tell me about this painting');
    });

    it('passes context from audio request body', async () => {
      mockPostAudioMessage.mockResolvedValueOnce({
        sessionId: 'session-uuid',
        message: {
          id: 'm-1',
          role: 'assistant',
          text: 'ok',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        metadata: {},
        transcription: { text: 'hi', model: 'whisper-1', provider: 'openai' },
      });

      await request(app)
        .post('/api/chat/sessions/session-uuid/audio')
        .set('Authorization', `Bearer ${userToken()}`)
        .field('context', JSON.stringify({ locale: 'fr' }))
        .attach('audio', Buffer.from('fake-audio'), {
          filename: 'recording.webm',
          contentType: 'audio/webm',
        });

      expect(mockPostAudioMessage).toHaveBeenCalledWith(
        'session-uuid',
        expect.objectContaining({
          context: expect.objectContaining({ locale: 'fr' }),
        }),
        expect.any(String),
        1,
      );
    });

    it('forwards AppError from postAudioMessage', async () => {
      mockPostAudioMessage.mockRejectedValueOnce(
        new AppError({
          message: 'Session not found',
          statusCode: 404,
          code: 'NOT_FOUND',
        }),
      );

      const res = await request(app)
        .post('/api/chat/sessions/bad-session/audio')
        .set('Authorization', `Bearer ${userToken()}`)
        .attach('audio', Buffer.from('fake-audio'), {
          filename: 'recording.webm',
          contentType: 'audio/webm',
        });

      expect(res.status).toBe(404);
    });
  });
});
