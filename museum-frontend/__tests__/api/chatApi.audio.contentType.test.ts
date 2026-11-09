import '@/__tests__/helpers/test-utils';

import { makePostMessageResponse } from '@/__tests__/helpers/factories';

const mockHttpRequest = jest.fn<Promise<unknown>, [string, Record<string, unknown>?]>();

jest.mock('@/shared/api/httpRequest', () => ({
  httpRequest: (...args: unknown[]) =>
    mockHttpRequest(args[0] as string, args[1] as Record<string, unknown>),
}));

jest.mock('@/features/auth/infrastructure/authTokenStore', () => ({
  getAccessToken: () => 'test-access-token',
}));

jest.mock('@/shared/infrastructure/httpClient', () => ({
  getLocale: () => 'en-US',
}));

import { chatApi } from '@/features/chat/infrastructure/chatApi';

const headersOf = (callIndex = 0): Record<string, string> => {
  const options = mockHttpRequest.mock.calls[callIndex]?.[1];
  return (options?.headers as Record<string, string> | undefined) ?? {};
};

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
