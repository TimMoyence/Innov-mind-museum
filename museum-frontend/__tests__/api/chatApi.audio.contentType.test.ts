/**
 * chatApi.postAudioMessage — explicit multipart Content-Type header.
 *
 * On-device (React Native), axios does not recognise RN's FormData polyfill, so
 * without an explicit `Content-Type: multipart/form-data` header it defaults a
 * POST body to `application/x-www-form-urlencoded`. RN's native NetworkingModule
 * then builds a MultipartBody from the FormData and `MultipartBody.setType`
 * throws (`multipart != application/x-www-form-urlencoded`) — the voice upload
 * fails on-device with a "Network unavailable" error. The image-compare upload
 * already sets this same header for the same reason.
 *
 * RED (without the fix — audio.ts sets no `headers`): the second assertion sees
 * an empty header object → fails → jest exits ≠ 0.
 * GREEN (with the fix — audio.ts sets headers:{'Content-Type':'multipart/form-data'}):
 * both assertions pass.
 *
 * Run scope (FE): npx jest chatApi.audio.contentType
 */
import '@/__tests__/helpers/test-utils';

import { makePostMessageResponse } from '@/__tests__/helpers/factories';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockHttpRequest = jest.fn<Promise<unknown>, [string, Record<string, unknown>?]>();

jest.mock('@/shared/api/httpRequest', () => ({
  httpRequest: (...args: unknown[]) =>
    mockHttpRequest(args[0] as string, args[1] as Record<string, unknown>),
}));

jest.mock('@/features/auth/infrastructure/authTokenStore', () => ({
  getAccessToken: () => 'test-access-token',
}));

jest.mock('@/shared/infrastructure/httpClient', () => ({
  getApiBaseUrl: () => 'https://api.test.com',
  getLocale: () => 'en-US',
}));

import { chatApi } from '@/features/chat/infrastructure/chatApi';

// ── Helpers ──────────────────────────────────────────────────────────────────

const headersOf = (callIndex = 0): Record<string, string> => {
  const options = mockHttpRequest.mock.calls[callIndex]?.[1];
  return (options?.headers as Record<string, string> | undefined) ?? {};
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('chatApi.postAudioMessage — multipart Content-Type header', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHttpRequest.mockResolvedValue(makePostMessageResponse());
  });

  it('uploads the audio as a FormData multipart body', async () => {
    await chatApi.postAudioMessage({ sessionId: 'sess-1', audioUri: '/tmp/voice.m4a' });

    const callBody = mockHttpRequest.mock.calls[0]?.[1]?.body;
    expect(callBody).toBeInstanceOf(FormData);
  });

  it('sets an explicit multipart Content-Type so RN axios does not default to urlencoded', async () => {
    await chatApi.postAudioMessage({ sessionId: 'sess-1', audioUri: '/tmp/voice.m4a' });

    expect(headersOf()).toEqual(expect.objectContaining({ 'Content-Type': 'multipart/form-data' }));
  });
});
