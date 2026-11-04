import '@/__tests__/helpers/test-utils';

import { makePostMessageResponse } from '@/__tests__/helpers/factories';

const mockHttpRequest = jest.fn<Promise<unknown>, [string, Record<string, unknown>?]>();

jest.mock('@/shared/api/httpRequest', () => ({
  httpRequest: (...args: unknown[]) =>
    mockHttpRequest(args[0] as string, args[1] as Record<string, unknown>),
}));

jest.mock('@/shared/api/openapiClient', () => ({
  openApiRequest: jest.fn(),
}));

jest.mock('@/features/auth/infrastructure/authTokenStore', () => ({
  getAccessToken: () => 'test-access-token',
}));

jest.mock('@/shared/infrastructure/httpClient', () => ({
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
import { MODEL_REPLY_TIMEOUT_MS } from '@/features/chat/infrastructure/chatApi/_internals';

const BACKEND_CHAT_SOCKET_CEILING_MS = 29_000;

const timeoutOf = (callIndex = 0): number => {
  const timeoutMs = mockHttpRequest.mock.calls[callIndex]?.[1]?.timeoutMs;
  expect(timeoutMs).toEqual(expect.any(Number));
  return timeoutMs as number;
};

describe('chat requests that wait on the model', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('give the model longer than the backend chat budget', () => {
    expect(MODEL_REPLY_TIMEOUT_MS).toBeGreaterThan(BACKEND_CHAT_SOCKET_CEILING_MS);
  });

  it('a text message waits for the model reply', async () => {
    mockHttpRequest.mockResolvedValue(makePostMessageResponse());

    await chatApi.postMessage({ sessionId: 'sess-1', text: 'Hello' });

    expect(timeoutOf()).toBe(MODEL_REPLY_TIMEOUT_MS);
  });

  it('a voice message waits for transcription, reply and synthesis', async () => {
    mockHttpRequest.mockResolvedValue(makePostMessageResponse());

    await chatApi.postAudioMessage({ sessionId: 'sess-1', audioUri: '/path/to/voice.m4a' });

    expect(timeoutOf()).toBe(MODEL_REPLY_TIMEOUT_MS);
  });

  it('speech synthesis waits for the full reply audio', async () => {
    mockHttpRequest.mockResolvedValue(new ArrayBuffer(8));

    await chatApi.synthesizeSpeech('msg-1');

    expect(timeoutOf()).toBe(MODEL_REPLY_TIMEOUT_MS);
  });
});
