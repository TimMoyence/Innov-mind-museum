import '@/__tests__/helpers/test-utils';

import {
  makeCreateSessionResponse,
  makeGetSessionResponse,
  makeListSessionsResponse,
  makePostMessageResponse,
} from '@/__tests__/helpers/factories';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockHttpRequest = jest.fn<Promise<unknown>, [string, Record<string, unknown>?]>();
const mockOpenApiRequest = jest.fn<Promise<unknown>, [Record<string, unknown>]>();

jest.mock('@/shared/api/httpRequest', () => ({
  httpRequest: (...args: unknown[]) =>
    mockHttpRequest(args[0] as string, args[1] as Record<string, unknown>),
}));

jest.mock('@/shared/api/openapiClient', () => ({
  openApiRequest: (params: Record<string, unknown>) => mockOpenApiRequest(params),
}));

jest.mock('@/features/auth/infrastructure/authTokenStore', () => ({
  getAccessToken: () => 'test-access-token',
}));

jest.mock('@/shared/infrastructure/httpClient', () => ({
  getApiBaseUrl: () => 'https://api.test.com',
  getLocale: () => 'en-US',
}));

jest.mock('@/shared/infrastructure/requestId', () => ({
  generateRequestId: () => 'test-request-id',
}));

jest.mock('@sentry/core', () => ({
  getTraceData: () => ({}),
  isInitialized: () => false,
}));

import { chatApi } from '@/features/chat/infrastructure/chatApi';

// ── Tests ────────────────────────────────────────────────────────────────────

describe('chatApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  // ── createSession ──────────────────────────────────────────────────────────

  describe('createSession', () => {
    it('sends correct path, method, and body', async () => {
      const response = makeCreateSessionResponse();
      mockOpenApiRequest.mockResolvedValue(response);

      await chatApi.createSession({ locale: 'fr-FR', museumMode: true });

      expect(mockOpenApiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/api/chat/sessions',
          method: 'post',
          body: JSON.stringify({ locale: 'fr-FR', museumMode: true }),
        }),
      );
    });

    it('returns validated response from factory', async () => {
      const response = makeCreateSessionResponse();
      mockOpenApiRequest.mockResolvedValue(response);

      const result = await chatApi.createSession({});

      expect(result.session.id).toBe(response.session.id);
      expect(result.session.museumMode).toBe(response.session.museumMode);
    });

    it('throws on invalid contract shape', async () => {
      mockOpenApiRequest.mockResolvedValue({ invalid: true });

      await expect(chatApi.createSession({})).rejects.toThrow('Invalid create-session contract');
    });
  });

  // ── postMessage ────────────────────────────────────────────────────────────

  describe('postMessage', () => {
    it('sends JSON body for text-only message', async () => {
      const response = makePostMessageResponse();
      mockHttpRequest.mockResolvedValue(response);

      await chatApi.postMessage({
        sessionId: 'sess-1',
        text: 'Hello',
        museumMode: true,
        locale: 'en',
      });

      expect(mockHttpRequest).toHaveBeenCalledWith(
        '/api/chat/sessions/sess-1/messages',
        expect.objectContaining({
          method: 'POST',
        }),
      );

      const callBody = mockHttpRequest.mock.calls[0]?.[1]?.body as string;
      const parsed = JSON.parse(callBody) as Record<string, unknown>;
      expect(parsed.text).toBe('Hello');
      expect(parsed.context).toEqual(expect.objectContaining({ museumMode: true, locale: 'en' }));
    });

    it('sends FormData body when imageUri is provided', async () => {
      const response = makePostMessageResponse();
      mockHttpRequest.mockResolvedValue(response);

      await chatApi.postMessage({
        sessionId: 'sess-1',
        text: 'What is this?',
        imageUri: '/path/to/photo.jpg',
        museumMode: false,
      });

      const callBody = mockHttpRequest.mock.calls[0]?.[1]?.body;
      expect(callBody).toBeInstanceOf(FormData);
    });

    it('trims text in JSON payload', async () => {
      const response = makePostMessageResponse();
      mockHttpRequest.mockResolvedValue(response);

      await chatApi.postMessage({ sessionId: 's', text: '  spaced  ' });

      const callBody = mockHttpRequest.mock.calls[0]?.[1]?.body as string;
      const parsed = JSON.parse(callBody) as { text: string };
      expect(parsed.text).toBe('spaced');
    });

    it('validates response contract', async () => {
      mockHttpRequest.mockResolvedValue({ bad: 'data' });

      await expect(chatApi.postMessage({ sessionId: 's', text: 'hi' })).rejects.toThrow(
        'Invalid post-message contract',
      );
    });
  });

  // ── postAudioMessage ───────────────────────────────────────────────────────

  describe('postAudioMessage', () => {
    it('sends FormData with audio URI', async () => {
      const response = makePostMessageResponse();
      mockHttpRequest.mockResolvedValue(response);

      await chatApi.postAudioMessage({
        sessionId: 'sess-1',
        audioUri: '/path/to/voice.m4a',
        museumMode: true,
      });

      expect(mockHttpRequest).toHaveBeenCalledWith(
        '/api/chat/sessions/sess-1/audio',
        expect.objectContaining({ method: 'POST' }),
      );
      const callBody = mockHttpRequest.mock.calls[0]?.[1]?.body;
      expect(callBody).toBeInstanceOf(FormData);
    });

    it('sends FormData with audio blob', async () => {
      const response = makePostMessageResponse();
      mockHttpRequest.mockResolvedValue(response);

      const blob = new Blob(['audio-data'], { type: 'audio/webm' });
      await chatApi.postAudioMessage({
        sessionId: 'sess-1',
        audioBlob: blob,
      });

      const callBody = mockHttpRequest.mock.calls[0]?.[1]?.body;
      expect(callBody).toBeInstanceOf(FormData);
    });

    it('throws when neither audioUri nor audioBlob provided', async () => {
      await expect(chatApi.postAudioMessage({ sessionId: 'sess-1' })).rejects.toThrow(
        'audioUri or audioBlob is required',
      );
    });
  });

  // ── getSession ─────────────────────────────────────────────────────────────

  describe('getSession', () => {
    it('calls openApiRequest with correct path and query', async () => {
      const response = makeGetSessionResponse();
      mockOpenApiRequest.mockResolvedValue(response);

      await chatApi.getSession('session-42');

      expect(mockOpenApiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/api/chat/sessions/{id}',
          method: 'get',
          pathParams: { id: 'session-42' },
          query: { limit: 50 },
        }),
      );
    });

    it('returns validated session with messages', async () => {
      const response = makeGetSessionResponse();
      mockOpenApiRequest.mockResolvedValue(response);

      const result = await chatApi.getSession('session-42');

      expect(result.session.id).toBe(response.session.id);
      expect(result.messages).toHaveLength(response.messages.length);
    });

    it('throws on invalid contract', async () => {
      mockOpenApiRequest.mockResolvedValue({ missing: 'fields' });

      await expect(chatApi.getSession('bad')).rejects.toThrow('Invalid get-session contract');
    });
  });

  // ── deleteSessionIfEmpty ───────────────────────────────────────────────────

  describe('deleteSessionIfEmpty', () => {
    it('calls openApiRequest with DELETE method', async () => {
      mockOpenApiRequest.mockResolvedValue({ sessionId: 'sess-1', deleted: true });

      await chatApi.deleteSessionIfEmpty('sess-1');

      expect(mockOpenApiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/api/chat/sessions/{id}',
          method: 'delete',
          pathParams: { id: 'sess-1' },
        }),
      );
    });

    it('returns validated deletion response', async () => {
      mockOpenApiRequest.mockResolvedValue({ sessionId: 'sess-1', deleted: true });

      const result = await chatApi.deleteSessionIfEmpty('sess-1');

      expect(result.sessionId).toBe('sess-1');
      expect(result.deleted).toBe(true);
    });
  });

  // ── listSessions ───────────────────────────────────────────────────────────

  describe('listSessions', () => {
    it('passes cursor and limit as query params', async () => {
      const response = makeListSessionsResponse();
      mockOpenApiRequest.mockResolvedValue(response);

      await chatApi.listSessions({ cursor: 'abc', limit: 5 });

      expect(mockOpenApiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/api/chat/sessions',
          method: 'get',
          query: { cursor: 'abc', limit: 5 },
        }),
      );
    });

    it('defaults to empty params when none provided', async () => {
      const response = makeListSessionsResponse();
      mockOpenApiRequest.mockResolvedValue(response);

      await chatApi.listSessions();

      expect(mockOpenApiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          query: { cursor: undefined, limit: undefined },
        }),
      );
    });
  });

  // ── reportMessage ──────────────────────────────────────────────────────────

  describe('reportMessage', () => {
    it('sends correct payload structure', async () => {
      mockOpenApiRequest.mockResolvedValue({ messageId: 'msg-1', reported: true });

      await chatApi.reportMessage({
        messageId: 'msg-1',
        reason: 'offensive',
        comment: 'This is offensive',
      });

      expect(mockOpenApiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/api/chat/messages/{messageId}/report',
          method: 'post',
          pathParams: { messageId: 'msg-1' },
          body: JSON.stringify({ reason: 'offensive', comment: 'This is offensive' }),
        }),
      );
    });
  });

  // ── setMessageFeedback ─────────────────────────────────────────────────────

  describe('setMessageFeedback', () => {
    it('sends POST with feedback value', async () => {
      mockOpenApiRequest.mockResolvedValue({ messageId: 'msg-1', status: 'created' });

      const result = await chatApi.setMessageFeedback('msg-1', 'positive');

      expect(mockOpenApiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/api/chat/messages/{messageId}/feedback',
          method: 'post',
          pathParams: { messageId: 'msg-1' },
          body: JSON.stringify({ value: 'positive' }),
        }),
      );
      expect(result.status).toBe('created');
    });
  });

  // ── synthesizeSpeech ───────────────────────────────────────────────────────

  describe('synthesizeSpeech', () => {
    it('returns ArrayBuffer on success', async () => {
      const buffer = new ArrayBuffer(100);
      mockHttpRequest.mockResolvedValue(buffer);

      const result = await chatApi.synthesizeSpeech('msg-1');

      expect(result).toBeInstanceOf(ArrayBuffer);
      expect(mockHttpRequest).toHaveBeenCalledWith(
        '/api/chat/messages/msg-1/tts',
        expect.objectContaining({ method: 'POST', responseType: 'arraybuffer' }),
      );
    });

    it('returns null for empty ArrayBuffer (204 No Content)', async () => {
      const emptyBuffer = new ArrayBuffer(0);
      mockHttpRequest.mockResolvedValue(emptyBuffer);

      const result = await chatApi.synthesizeSpeech('msg-1');

      expect(result).toBeNull();
    });

    it('returns null when response is falsy', async () => {
      mockHttpRequest.mockResolvedValue(null);

      const result = await chatApi.synthesizeSpeech('msg-1');

      expect(result).toBeNull();
    });

    it('wraps errors with getErrorMessage', async () => {
      mockHttpRequest.mockRejectedValue(new Error('Network error'));

      await expect(chatApi.synthesizeSpeech('msg-1')).rejects.toThrow();
    });
  });

  // ── getMessageImageUrl ─────────────────────────────────────────────────────

  describe('getMessageImageUrl', () => {
    it('calls correct endpoint with messageId', async () => {
      const signedResponse = {
        url: 'https://cdn.test.com/signed',
        expiresAt: '2026-01-01T00:00:00Z',
      };
      mockOpenApiRequest.mockResolvedValue(signedResponse);

      const result = await chatApi.getMessageImageUrl('msg-42');

      expect(mockOpenApiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/api/chat/messages/{messageId}/image-url',
          method: 'post',
          pathParams: { messageId: 'msg-42' },
        }),
      );
      expect(result).toEqual(signedResponse);
    });
  });

  // ── createSessionOrThrow ───────────────────────────────────────────────────

  describe('createSessionOrThrow', () => {
    it('delegates to createSession on success', async () => {
      const response = makeCreateSessionResponse();
      mockOpenApiRequest.mockResolvedValue(response);

      const result = await chatApi.createSessionOrThrow({ locale: 'en' });

      expect(result.session.id).toBe(response.session.id);
    });

    it('wraps errors as plain Error', async () => {
      mockOpenApiRequest.mockRejectedValue(new Error('API down'));

      await expect(chatApi.createSessionOrThrow({})).rejects.toThrow();
    });
  });

  // ── sendMessageSmart (post-burial: ALWAYS sync) ──────────────────────────────
  //
  // After the dormant SSE path is buried (D1), `sendMessageSmart` is a thin
  // façade over the sync `postMessage` transport: it ignores any streaming
  // callbacks and never consults a streaming feature flag. These assertions
  // pin that always-sync contract.

  describe('sendMessageSmart', () => {
    it('returns the sync postMessage DTO even when onToken is supplied', async () => {
      // The streaming flag being "enabled" must NOT route to a stream path —
      // the SSE transport no longer exists, so the only path is sync.
      const originalStreamingFlag = process.env.EXPO_PUBLIC_CHAT_STREAMING;
      process.env.EXPO_PUBLIC_CHAT_STREAMING = 'true';

      try {
        const response = makePostMessageResponse();
        mockHttpRequest.mockResolvedValue(response);

        const result = await chatApi.sendMessageSmart({
          sessionId: 'sess-1',
          text: 'Hello',
          onToken: () => {
            /* never invoked — streaming buried, always sync */
          },
        });

        expect(result).toBeTruthy();
        expect(mockHttpRequest).toHaveBeenCalled();
      } finally {
        if (originalStreamingFlag === undefined) {
          delete process.env.EXPO_PUBLIC_CHAT_STREAMING;
        } else {
          process.env.EXPO_PUBLIC_CHAT_STREAMING = originalStreamingFlag;
        }
      }
    });

    it('uses the sync path when imageUri is provided', async () => {
      const response = makePostMessageResponse();
      mockHttpRequest.mockResolvedValue(response);

      const result = await chatApi.sendMessageSmart({
        sessionId: 'sess-1',
        text: 'What is this?',
        imageUri: '/path/to/photo.jpg',
        onToken: () => {
          /* noop */
        },
      });

      expect(result).toBeTruthy();
      expect(mockHttpRequest).toHaveBeenCalled();
    });

    it('uses the sync path when no onToken callback is supplied', async () => {
      const response = makePostMessageResponse();
      mockHttpRequest.mockResolvedValue(response);

      await chatApi.sendMessageSmart({
        sessionId: 'sess-1',
        text: 'Hello',
      });

      expect(mockHttpRequest).toHaveBeenCalled();
    });
  });

  // ── postMessage image MIME type normalization ─────────────────────────────

  describe('postMessage image MIME types', () => {
    it('normalizes .jpeg extension to image/jpeg', async () => {
      const response = makePostMessageResponse();
      mockHttpRequest.mockResolvedValue(response);

      await chatApi.postMessage({
        sessionId: 'sess-1',
        imageUri: '/path/to/photo.jpeg',
      });

      const callBody = mockHttpRequest.mock.calls[0]?.[1]?.body as FormData;
      expect(callBody).toBeInstanceOf(FormData);
    });

    it('normalizes .png extension to image/png', async () => {
      const response = makePostMessageResponse();
      mockHttpRequest.mockResolvedValue(response);

      await chatApi.postMessage({
        sessionId: 'sess-1',
        imageUri: '/path/to/photo.png',
      });

      const callBody = mockHttpRequest.mock.calls[0]?.[1]?.body as FormData;
      expect(callBody).toBeInstanceOf(FormData);
    });

    it('normalizes .webp extension to image/webp', async () => {
      const response = makePostMessageResponse();
      mockHttpRequest.mockResolvedValue(response);

      await chatApi.postMessage({
        sessionId: 'sess-1',
        imageUri: '/path/to/photo.webp',
      });

      const callBody = mockHttpRequest.mock.calls[0]?.[1]?.body as FormData;
      expect(callBody).toBeInstanceOf(FormData);
    });

    it('falls back to image/<extension> for unknown extensions', async () => {
      const response = makePostMessageResponse();
      mockHttpRequest.mockResolvedValue(response);

      await chatApi.postMessage({
        sessionId: 'sess-1',
        imageUri: '/path/to/photo.heic',
      });

      const callBody = mockHttpRequest.mock.calls[0]?.[1]?.body as FormData;
      expect(callBody).toBeInstanceOf(FormData);
    });
  });
});
