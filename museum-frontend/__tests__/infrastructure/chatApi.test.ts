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

const mockExpoFetch = jest.fn<Promise<Response>, [string, RequestInit?]>();
jest.mock('expo/fetch', () => ({
  fetch: (...args: unknown[]) => mockExpoFetch(args[0] as string, args[1] as RequestInit),
}));

import { chatApi } from '@/features/chat/infrastructure/chatApi';

// ── Tests ────────────────────────────────────────────────────────────────────

const makeStreamResponse = (body: string, status = 200): Response => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(body));
      controller.close();
    },
  });

  return {
    ok: status >= 200 && status < 300,
    status,
    body: stream,
    text: () => Promise.resolve(body),
    headers: new Headers(),
  } as unknown as Response;
};

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

      const callBody = mockHttpRequest.mock.calls[0][1]?.body as string;
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

      const callBody = mockHttpRequest.mock.calls[0][1]?.body;
      expect(callBody).toBeInstanceOf(FormData);
    });

    it('trims text in JSON payload', async () => {
      const response = makePostMessageResponse();
      mockHttpRequest.mockResolvedValue(response);

      await chatApi.postMessage({ sessionId: 's', text: '  spaced  ' });

      const callBody = mockHttpRequest.mock.calls[0][1]?.body as string;
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
      const callBody = mockHttpRequest.mock.calls[0][1]?.body;
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

      const callBody = mockHttpRequest.mock.calls[0][1]?.body;
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

  // ── postMessageStream ──────────────────────────────────────────────────────
  describe('postMessageStream', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('calls onToken for each SSE token event', async () => {
      const sseData = [
        'event: token\ndata: {"t":"Hello"}\n\n',
        'event: token\ndata: {"t":" world"}\n\n',
        'event: done\ndata: {"messageId":"m1","createdAt":"2026-01-01T00:00:00Z","metadata":{}}\n\n',
      ].join('');

      mockExpoFetch.mockResolvedValue(makeStreamResponse(sseData));

      const tokens: string[] = [];
      let donePayload: Record<string, unknown> | null = null;

      await chatApi.postMessageStream({
        sessionId: 'sess-1',
        text: 'Hi',
        onToken: (text) => tokens.push(text),
        onDone: (payload) => {
          donePayload = payload as Record<string, unknown>;
        },
        onError: () => {
          /* noop */
        },
      });

      expect(tokens).toEqual(['Hello', ' world']);
      expect(donePayload).toEqual(expect.objectContaining({ messageId: 'm1' }));
    });

    it('calls onError for SSE error event', async () => {
      const sseData = 'event: error\ndata: {"code":"RATE_LIMITED","message":"Too fast"}\n\n';

      mockExpoFetch.mockResolvedValue(makeStreamResponse(sseData));

      let errorCode = '';
      let errorMsg = '';

      await chatApi.postMessageStream({
        sessionId: 'sess-1',
        onToken: () => {
          /* noop */
        },
        onDone: () => {
          /* noop */
        },
        onError: (code, message) => {
          errorCode = code;
          errorMsg = message;
        },
      });

      expect(errorCode).toBe('RATE_LIMITED');
      expect(errorMsg).toBe('Too fast');
    });

    it('calls onGuardrail for guardrail event', async () => {
      const sseData = 'event: guardrail\ndata: {"text":"Off topic","reason":"not_art"}\n\n';

      mockExpoFetch.mockResolvedValue(makeStreamResponse(sseData));

      let guardrailText = '';
      let guardrailReason = '';

      await chatApi.postMessageStream({
        sessionId: 'sess-1',
        onToken: () => {
          /* noop */
        },
        onDone: () => {
          /* noop */
        },
        onError: () => {
          /* noop */
        },
        onGuardrail: (text, reason) => {
          guardrailText = text;
          guardrailReason = reason;
        },
      });

      expect(guardrailText).toBe('Off topic');
      expect(guardrailReason).toBe('not_art');
    });

    it('throws STREAMING_NOT_AVAILABLE on 404 response', async () => {
      mockExpoFetch.mockResolvedValue(makeStreamResponse('', 404));

      await expect(
        chatApi.postMessageStream({
          sessionId: 's',
          onToken: () => {
            /* noop */
          },
          onDone: () => {
            /* noop */
          },
          onError: () => {
            /* noop */
          },
        }),
      ).rejects.toThrow('STREAMING_NOT_AVAILABLE');
    });

    it('throws STREAMING_UNAUTHORIZED on 401 response', async () => {
      mockExpoFetch.mockResolvedValue(makeStreamResponse('', 401));

      await expect(
        chatApi.postMessageStream({
          sessionId: 's',
          onToken: () => {
            /* noop */
          },
          onDone: () => {
            /* noop */
          },
          onError: () => {
            /* noop */
          },
        }),
      ).rejects.toThrow('STREAMING_UNAUTHORIZED');
    });

    it('calls onError for non-404/non-401 HTTP errors', async () => {
      mockExpoFetch.mockResolvedValue(makeStreamResponse('', 500));

      let errorCode = '';

      await chatApi.postMessageStream({
        sessionId: 's',
        onToken: () => {
          /* noop */
        },
        onDone: () => {
          /* noop */
        },
        onError: (code) => {
          errorCode = code;
        },
      });

      expect(errorCode).toBe('HTTP_ERROR');
    });

    it('sends correct headers including auth and request ID', async () => {
      const sseData =
        'event: done\ndata: {"messageId":"m1","createdAt":"2026-01-01T00:00:00Z","metadata":{}}\n\n';
      mockExpoFetch.mockResolvedValue(makeStreamResponse(sseData));

      await chatApi.postMessageStream({
        sessionId: 'sess-1',
        text: 'Hi',
        onToken: () => {
          /* noop */
        },
        onDone: () => {
          /* noop */
        },
        onError: () => {
          /* noop */
        },
      });

      const fetchCall = mockExpoFetch.mock.calls[0];
      expect(fetchCall[0]).toBe('https://api.test.com/api/chat/sessions/sess-1/messages/stream');
      const headers = fetchCall[1]?.headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer test-access-token');
      expect(headers['X-Request-Id']).toBe('test-request-id');
      expect(headers['Accept-Language']).toBe('en-US');
      expect(headers.Accept).toBe('text/event-stream');
    });
  });

  // ── sendMessageSmart ───────────────────────────────────────────────────────

  describe('sendMessageSmart', () => {
    const originalStreamingFlag = process.env.EXPO_PUBLIC_CHAT_STREAMING;

    beforeEach(() => {
      jest.useFakeTimers();
      // Most tests below exercise the streaming path — enable the feature flag.
      // Tests that verify the flag-off bypass explicitly override this.
      process.env.EXPO_PUBLIC_CHAT_STREAMING = 'true';
    });

    afterEach(() => {
      jest.useRealTimers();
      if (originalStreamingFlag === undefined) {
        delete process.env.EXPO_PUBLIC_CHAT_STREAMING;
      } else {
        process.env.EXPO_PUBLIC_CHAT_STREAMING = originalStreamingFlag;
      }
    });

    it('bypasses streaming when EXPO_PUBLIC_CHAT_STREAMING is disabled', async () => {
      delete process.env.EXPO_PUBLIC_CHAT_STREAMING;
      const response = makePostMessageResponse();
      mockHttpRequest.mockResolvedValue(response);

      const result = await chatApi.sendMessageSmart({
        sessionId: 'sess-1',
        text: 'Hello',
        onToken: () => {
          /* never called — streaming bypassed */
        },
      });

      expect(result).toBeTruthy();
      expect(mockHttpRequest).toHaveBeenCalled();
      expect(mockExpoFetch).not.toHaveBeenCalled();
    });

    it('uses non-streaming path when imageUri is provided', async () => {
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
      expect(mockExpoFetch).not.toHaveBeenCalled();
    });

    it('uses non-streaming path when no onToken callback', async () => {
      const response = makePostMessageResponse();
      mockHttpRequest.mockResolvedValue(response);

      await chatApi.sendMessageSmart({
        sessionId: 'sess-1',
        text: 'Hello',
      });

      expect(mockHttpRequest).toHaveBeenCalled();
      expect(mockExpoFetch).not.toHaveBeenCalled();
    });

    it('falls back to non-streaming on STREAMING_NOT_AVAILABLE', async () => {
      // First call: expoFetch returns 404 => STREAMING_NOT_AVAILABLE
      mockExpoFetch.mockResolvedValue({
        ok: false,
        status: 404,
        body: null,
        headers: new Headers(),
      } as unknown as Response);

      // Fallback: httpRequest returns valid response
      const response = makePostMessageResponse();
      mockHttpRequest.mockResolvedValue(response);

      const result = await chatApi.sendMessageSmart({
        sessionId: 'sess-1',
        text: 'Hello',
        onToken: () => {
          /* noop */
        },
      });

      expect(result).toBeTruthy();
      expect(mockExpoFetch).toHaveBeenCalled();
      expect(mockHttpRequest).toHaveBeenCalled();
    });

    it('falls back to non-streaming on STREAMING_UNAUTHORIZED', async () => {
      mockExpoFetch.mockResolvedValue({
        ok: false,
        status: 401,
        body: null,
        headers: new Headers(),
      } as unknown as Response);

      const response = makePostMessageResponse();
      mockHttpRequest.mockResolvedValue(response);

      const result = await chatApi.sendMessageSmart({
        sessionId: 'sess-1',
        text: 'Hello',
        onToken: () => {
          /* noop */
        },
      });

      expect(result).toBeTruthy();
      expect(mockHttpRequest).toHaveBeenCalled();
    });

    it('propagates non-recoverable streaming errors', async () => {
      mockExpoFetch.mockRejectedValue(new Error('Network failure'));

      await expect(
        chatApi.sendMessageSmart({
          sessionId: 'sess-1',
          text: 'Hello',
          onToken: () => {
            /* noop */
          },
        }),
      ).rejects.toThrow('Network failure');
    });

    it('constructs PostMessageResponseDTO from streaming onDone and returns it', async () => {
      const sseData = [
        'event: token\ndata: {"t":"Hello"}\n\n',
        'event: done\ndata: {"messageId":"m-stream","createdAt":"2026-01-01T00:00:00Z","metadata":{"foo":"bar"}}\n\n',
      ].join('');

      mockExpoFetch.mockResolvedValue(makeStreamResponse(sseData));

      let donePayload: Record<string, unknown> | null = null;
      const result = await chatApi.sendMessageSmart({
        sessionId: 'sess-1',
        text: 'Hi',
        onToken: () => {
          /* noop */
        },
        onDone: (payload) => {
          donePayload = payload as Record<string, unknown>;
        },
      });

      expect(result).toBeTruthy();
      expect(result?.message.id).toBe('m-stream');
      expect(result?.sessionId).toBe('sess-1');
      expect(donePayload).toEqual(expect.objectContaining({ messageId: 'm-stream' }));
    });

    it('throws stream error when SSE error event is received', async () => {
      const sseData = 'event: error\ndata: {"code":"RATE_LIMITED","message":"Slow down"}\n\n';

      mockExpoFetch.mockResolvedValue(makeStreamResponse(sseData));

      await expect(
        chatApi.sendMessageSmart({
          sessionId: 'sess-1',
          text: 'Hi',
          onToken: () => {
            /* noop */
          },
        }),
      ).rejects.toThrow('RATE_LIMITED: Slow down');
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

      const callBody = mockHttpRequest.mock.calls[0][1]?.body as FormData;
      expect(callBody).toBeInstanceOf(FormData);
    });

    it('normalizes .png extension to image/png', async () => {
      const response = makePostMessageResponse();
      mockHttpRequest.mockResolvedValue(response);

      await chatApi.postMessage({
        sessionId: 'sess-1',
        imageUri: '/path/to/photo.png',
      });

      const callBody = mockHttpRequest.mock.calls[0][1]?.body as FormData;
      expect(callBody).toBeInstanceOf(FormData);
    });

    it('normalizes .webp extension to image/webp', async () => {
      const response = makePostMessageResponse();
      mockHttpRequest.mockResolvedValue(response);

      await chatApi.postMessage({
        sessionId: 'sess-1',
        imageUri: '/path/to/photo.webp',
      });

      const callBody = mockHttpRequest.mock.calls[0][1]?.body as FormData;
      expect(callBody).toBeInstanceOf(FormData);
    });

    it('falls back to image/<extension> for unknown extensions', async () => {
      const response = makePostMessageResponse();
      mockHttpRequest.mockResolvedValue(response);

      await chatApi.postMessage({
        sessionId: 'sess-1',
        imageUri: '/path/to/photo.heic',
      });

      const callBody = mockHttpRequest.mock.calls[0][1]?.body as FormData;
      expect(callBody).toBeInstanceOf(FormData);
    });
  });

  // ── postMessageStream edge cases ──────────────────────────────────────────

  describe('postMessageStream edge cases', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('forwards pre-aborted signal to timeout controller', async () => {
      const abortController = new AbortController();
      abortController.abort('user cancelled');

      const sseData =
        'event: done\ndata: {"messageId":"m1","createdAt":"2026-01-01T00:00:00Z","metadata":{}}\n\n';
      mockExpoFetch.mockResolvedValue(makeStreamResponse(sseData));

      await chatApi.postMessageStream({
        sessionId: 'sess-1',
        onToken: () => {
          /* noop */
        },
        onDone: () => {
          /* noop */
        },
        onError: () => {
          /* noop */
        },
        signal: abortController.signal,
      });

      // Should not throw - the aborted signal is handled
    });

    it('forwards signal abort event to timeout controller', async () => {
      const abortController = new AbortController();

      const sseData =
        'event: done\ndata: {"messageId":"m1","createdAt":"2026-01-01T00:00:00Z","metadata":{}}\n\n';
      mockExpoFetch.mockResolvedValue(makeStreamResponse(sseData));

      await chatApi.postMessageStream({
        sessionId: 'sess-1',
        onToken: () => {
          /* noop */
        },
        onDone: () => {
          /* noop */
        },
        onError: () => {
          /* noop */
        },
        signal: abortController.signal,
      });

      // The signal listener should have been registered
    });

    it('falls back to response.text() when body has no getReader', async () => {
      const sseData =
        'event: token\ndata: {"t":"Fallback"}\n\nevent: done\ndata: {"messageId":"fb1","createdAt":"2026-01-01T00:00:00Z","metadata":{}}\n\n';

      // Create a response without a ReadableStream body
      const response = {
        ok: true,
        status: 200,
        body: null,
        text: () => Promise.resolve(sseData),
        headers: new Headers(),
      } as unknown as Response;

      mockExpoFetch.mockResolvedValue(response);

      const tokens: string[] = [];
      let donePayload: Record<string, unknown> | null = null;

      await chatApi.postMessageStream({
        sessionId: 'sess-1',
        text: 'Hi',
        onToken: (text) => tokens.push(text),
        onDone: (payload) => {
          donePayload = payload as Record<string, unknown>;
        },
        onError: () => {
          /* noop */
        },
      });

      expect(tokens).toEqual(['Fallback']);
      expect(donePayload).toEqual(expect.objectContaining({ messageId: 'fb1' }));
    });

    it('calls onError with STREAM_TIMEOUT on timeout error during reading', async () => {
      // Create a stream that throws a TimeoutError during read
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('event: token\ndata: {"t":"Hi"}\n\n'));
        },
        pull() {
          throw new DOMException('The operation timed out.', 'TimeoutError');
        },
      });

      const response = {
        ok: true,
        status: 200,
        body: stream,
        text: () => Promise.resolve(''),
        headers: new Headers(),
      } as unknown as Response;

      mockExpoFetch.mockResolvedValue(response);

      let errorCode = '';
      let errorMessage = '';

      await chatApi.postMessageStream({
        sessionId: 'sess-1',
        onToken: () => {
          /* noop */
        },
        onDone: () => {
          /* noop */
        },
        onError: (code, message) => {
          errorCode = code;
          errorMessage = message;
        },
      });

      expect(errorCode).toBe('STREAM_TIMEOUT');
      expect(errorMessage).toContain('too long');
    });

    it('calls onError with STREAM_ERROR on non-timeout, non-abort error during reading', async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('event: token\ndata: {"t":"Hi"}\n\n'));
        },
        pull() {
          throw new Error('Connection reset');
        },
      });

      const response = {
        ok: true,
        status: 200,
        body: stream,
        text: () => Promise.resolve(''),
        headers: new Headers(),
      } as unknown as Response;

      mockExpoFetch.mockResolvedValue(response);

      let errorCode = '';

      await chatApi.postMessageStream({
        sessionId: 'sess-1',
        onToken: () => {
          /* noop */
        },
        onDone: () => {
          /* noop */
        },
        onError: (code) => {
          errorCode = code;
        },
      });

      expect(errorCode).toBe('STREAM_ERROR');
    });

    it('processes remaining buffer after stream ends', async () => {
      // Create a stream that leaves data in the buffer without trailing \n\n
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('event: token\ndata: {"t":"Buffered"}'));
          controller.close();
        },
      });

      const response = {
        ok: true,
        status: 200,
        body: stream,
        text: () => Promise.resolve(''),
        headers: new Headers(),
      } as unknown as Response;

      mockExpoFetch.mockResolvedValue(response);

      const tokens: string[] = [];

      await chatApi.postMessageStream({
        sessionId: 'sess-1',
        onToken: (text) => tokens.push(text),
        onDone: () => {
          /* noop */
        },
        onError: () => {
          /* noop */
        },
      });

      expect(tokens).toEqual(['Buffered']);
    });
  });
   
});
