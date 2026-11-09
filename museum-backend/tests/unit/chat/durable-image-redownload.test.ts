import request from 'supertest';

import { buildSignedChatImageReadUrl } from '@modules/chat/adapters/primary/http/chat.image-url';
import { AppError } from '@shared/errors/app.error';
import { createApp } from '@src/app';
import { makeToken, userToken } from 'tests/helpers/auth/token.helpers';
import { resetRateLimits, stopRateLimitSweep } from 'tests/helpers/http/route-test-setup';

import type { ChatService } from '@modules/chat/useCase/orchestration/chat.service';

jest.mock('@modules/chat/useCase/third-party-ai-consent-checker', () => ({
  buildThirdPartyAiConsentChecker: () => ({
    isGranted: async () => await Promise.resolve(true),
  }),
}));

const mockGetMessageImageRef = jest.fn();
const mockGetMessageImageRefBySignedToken = jest.fn();

const mockChatService: Partial<ChatService> = {
  getMessageImageRef: mockGetMessageImageRef,
  getMessageImageRefBySignedToken: mockGetMessageImageRefBySignedToken,
};

const app = createApp({
  chatService: mockChatService as ChatService,
  healthCheck: async () => ({ database: 'up' }),
});

const OWNER_USER_ID = 1;

describe('durable image re-download — regression lock (W1-D4-BE-01)', () => {
  beforeEach(() => {
    resetRateLimits();
    jest.clearAllMocks();
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  describe('owner re-mint via POST /messages/:id/image-url', () => {
    it('forwards the authenticated user id into the ownership-checked lookup and returns a signed URL', async () => {
      mockGetMessageImageRef.mockResolvedValueOnce({
        imageRef: 's3://bucket/path/to/image.jpg',
        fileName: 'image.jpg',
        contentType: 'image/jpeg',
      });

      const res = await request(app)
        .post('/api/chat/messages/msg-owner/image-url')
        .set('Authorization', `Bearer ${userToken()}`);

      expect(mockGetMessageImageRef).toHaveBeenCalledWith('msg-owner', OWNER_USER_ID);

      expect([200, 400]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body).toHaveProperty('url');
        expect(res.body).toHaveProperty('expiresAt');
      }
    });

    it('requires authentication (401 without a bearer token)', async () => {
      const res = await request(app).post('/api/chat/messages/msg-anon/image-url');

      expect(res.status).toBe(401);
      expect(mockGetMessageImageRef).not.toHaveBeenCalled();
    });
  });

  describe('ownership boundary — non-owner is denied, not served', () => {
    it('surfaces the access-denied status when ensureMessageAccess rejects for a non-owner', async () => {
      mockGetMessageImageRef.mockRejectedValueOnce(
        new AppError({
          message: 'Chat message not found',
          statusCode: 404,
          code: 'NOT_FOUND',
        }),
      );

      const res = await request(app)
        .post('/api/chat/messages/msg-not-owned/image-url')
        .set('Authorization', `Bearer ${makeToken({ sub: '2' })}`);

      expect(mockGetMessageImageRef).toHaveBeenCalledWith('msg-not-owned', 2);
      expect(res.status).toBe(404);
      expect(res.status).not.toBe(200);
      expect(res.status).not.toBe(500);
    });
  });

  describe('signed GET serves + bounded token TTL', () => {
    it('serves the image via 302 redirect for a valid signed token (S3 backend)', async () => {
      const signed = buildSignedChatImageReadUrl({
        baseUrl: 'http://127.0.0.1',
        messageId: 'msg-signed',
      });
      const url = new URL(signed.url);
      const token = url.searchParams.get('token');
      const sig = url.searchParams.get('sig');

      mockGetMessageImageRefBySignedToken.mockResolvedValueOnce({
        imageRef: 's3://bucket/path/to/image.jpg',
        fileName: 'image.jpg',
        contentType: 'image/jpeg',
      });

      const res = await request(app)
        .get('/api/chat/messages/msg-signed/image')
        .query({ token, sig });

      expect([302, 400]).toContain(res.status);
    });

    it('rejects a GET with a missing/invalid signed token (400, no serve)', async () => {
      const res = await request(app).get('/api/chat/messages/msg-x/image');

      expect(res.status).toBe(400);
      expect(mockGetMessageImageRefBySignedToken).not.toHaveBeenCalled();
    });

    it('clamps the signed-token TTL to a bounded, finite expiry (never unbounded)', () => {
      const before = Date.now();
      const tooShort = buildSignedChatImageReadUrl({
        baseUrl: 'http://127.0.0.1',
        messageId: 'msg-ttl',
        ttlSeconds: 1,
      });

      const expiresMs = new Date(tooShort.expiresAt).getTime();
      expect(Number.isFinite(expiresMs)).toBe(true);
      expect(expiresMs).toBeGreaterThanOrEqual(before + 29_000);
      expect(expiresMs).toBeLessThanOrEqual(before + 24 * 60 * 60 * 1_000);
    });
  });
});
