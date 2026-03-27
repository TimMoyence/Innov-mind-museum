import { buildHealthPayload } from '@shared/routers/api.router';
import { buildChatTestService } from 'tests/helpers/chat/chatTestApp';
import { assertMatchesOpenApiResponse } from 'tests/helpers/openapi/openapi-response-validator';

describe('openapi response contracts (active API)', () => {
  it('validates health, auth and chat responses against the OpenAPI spec', async () => {
    const healthOk = buildHealthPayload({
      checks: { database: 'up' },
      llmConfigured: true,
    });
    const healthDegraded = buildHealthPayload({
      checks: { database: 'down' },
      llmConfigured: false,
    });

    assertMatchesOpenApiResponse({
      path: '/api/health',
      method: 'get',
      statusCode: 200,
      payload: healthOk,
    });
    assertMatchesOpenApiResponse({
      path: '/api/health',
      method: 'get',
      statusCode: 503,
      payload: healthDegraded,
    });

    const authSessionPayload = {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresIn: 900,
      refreshExpiresIn: 2592000,
      user: {
        id: 42,
        email: 'user@example.com',
        firstname: 'Ada',
        lastname: 'Lovelace',
        role: 'visitor',
      },
    };
    const authMePayload = {
      user: authSessionPayload.user,
    };

    assertMatchesOpenApiResponse({
      path: '/api/auth/register',
      method: 'post',
      statusCode: 201,
      payload: { user: { id: 42, email: 'new@test.com' } },
    });
    assertMatchesOpenApiResponse({
      path: '/api/auth/login',
      method: 'post',
      statusCode: 200,
      payload: authSessionPayload,
    });
    assertMatchesOpenApiResponse({
      path: '/api/auth/refresh',
      method: 'post',
      statusCode: 200,
      payload: authSessionPayload,
    });
    assertMatchesOpenApiResponse({
      path: '/api/auth/me',
      method: 'get',
      statusCode: 200,
      payload: authMePayload,
    });
    assertMatchesOpenApiResponse({
      path: '/api/auth/logout',
      method: 'post',
      statusCode: 200,
      payload: { success: true },
    });
    assertMatchesOpenApiResponse({
      path: '/api/auth/social-login',
      method: 'post',
      statusCode: 200,
      payload: authSessionPayload,
    });
    assertMatchesOpenApiResponse({
      path: '/api/auth/account',
      method: 'delete',
      statusCode: 200,
      payload: { deleted: true },
    });

    assertMatchesOpenApiResponse({
      path: '/api/auth/forgot-password',
      method: 'post',
      statusCode: 200,
      payload: { message: 'Si cet email existe, un lien de réinitialisation a été envoyé.' },
    });
    assertMatchesOpenApiResponse({
      path: '/api/auth/reset-password',
      method: 'post',
      statusCode: 200,
      payload: { message: 'Password updated successfully.' },
    });
    assertMatchesOpenApiResponse({
      path: '/api/auth/change-password',
      method: 'put',
      statusCode: 200,
      payload: { message: 'Password changed successfully.' },
    });
    assertMatchesOpenApiResponse({
      path: '/api/auth/verify-email',
      method: 'post',
      statusCode: 200,
      payload: { verified: true },
    });
    assertMatchesOpenApiResponse({
      path: '/api/auth/export-data',
      method: 'get',
      statusCode: 200,
      payload: {
        exportedAt: new Date().toISOString(),
        user: {
          id: 42,
          email: 'user@example.com',
          firstname: 'Ada',
          lastname: 'Lovelace',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        chatData: {},
      },
    });

    assertMatchesOpenApiResponse({
      path: '/api/auth/api-keys',
      method: 'post',
      statusCode: 201,
      payload: {
        apiKey: {
          id: 1,
          prefix: 'msk_abcd1234...',
          name: 'Test Key',
          createdAt: new Date().toISOString(),
        },
        plaintext: 'msk_abcd1234xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      },
    });
    assertMatchesOpenApiResponse({
      path: '/api/auth/api-keys',
      method: 'get',
      statusCode: 200,
      payload: {
        apiKeys: [
          {
            id: 1,
            prefix: 'msk_abcd1234...',
            name: 'My Key',
            createdAt: new Date().toISOString(),
            lastUsedAt: null,
            expiresAt: null,
            isActive: true,
          },
        ],
      },
    });
    assertMatchesOpenApiResponse({
      path: '/api/auth/api-keys/{id}',
      method: 'delete',
      statusCode: 200,
      payload: { revoked: true },
    });

    const chatService = buildChatTestService();

    const emptySession = await chatService.createSession({
      userId: 77,
      locale: 'fr-FR',
      museumMode: true,
    });
    const createPayload = { session: emptySession };
    assertMatchesOpenApiResponse({
      path: '/api/chat/sessions',
      method: 'post',
      statusCode: 201,
      payload: createPayload,
    });

    const postPayload = await chatService.postMessage(emptySession.id, {
      text: 'Bonjour',
      context: { locale: 'fr-FR' },
    });
    assertMatchesOpenApiResponse({
      path: '/api/chat/sessions/{id}/messages',
      method: 'post',
      statusCode: 201,
      payload: postPayload,
    });
    assertMatchesOpenApiResponse({
      path: '/api/chat/sessions/{id}/audio',
      method: 'post',
      statusCode: 201,
      payload: postPayload,
    });

    const getPayload = await chatService.getSession(emptySession.id, { limit: 20 }, 77);
    assertMatchesOpenApiResponse({
      path: '/api/chat/sessions/{id}',
      method: 'get',
      statusCode: 200,
      payload: getPayload,
    });

    const listPayload = await chatService.listSessions({ limit: 20 }, 77);
    assertMatchesOpenApiResponse({
      path: '/api/chat/sessions',
      method: 'get',
      statusCode: 200,
      payload: listPayload,
    });

    const signedImagePayload = {
      url: 'https://api.example.com/api/chat/messages/123/image?token=abc&sig=def',
      expiresAt: new Date().toISOString(),
    };
    assertMatchesOpenApiResponse({
      path: '/api/chat/messages/{messageId}/image-url',
      method: 'post',
      statusCode: 200,
      payload: signedImagePayload,
    });

    const deletable = await chatService.createSession({ userId: 77 });
    const deletePayload = await chatService.deleteSessionIfEmpty(deletable.id, 77);
    assertMatchesOpenApiResponse({
      path: '/api/chat/sessions/{id}',
      method: 'delete',
      statusCode: 200,
      payload: deletePayload,
    });
  });

  it('validates error responses match the ApiError schema', () => {
    const errorPayload = {
      error: {
        code: 'BAD_REQUEST',
        message: 'Validation failed',
        requestId: 'req-123',
      },
    };

    const errorEndpoints: Array<{
      path: string;
      method: 'get' | 'post' | 'put' | 'delete';
      statusCode: number;
    }> = [
      { path: '/api/auth/register', method: 'post', statusCode: 400 },
      { path: '/api/auth/login', method: 'post', statusCode: 400 },
      { path: '/api/auth/login', method: 'post', statusCode: 401 },
      { path: '/api/auth/refresh', method: 'post', statusCode: 400 },
      { path: '/api/auth/refresh', method: 'post', statusCode: 401 },
      { path: '/api/auth/me', method: 'get', statusCode: 401 },
      { path: '/api/auth/social-login', method: 'post', statusCode: 400 },
      { path: '/api/auth/social-login', method: 'post', statusCode: 401 },
      { path: '/api/auth/account', method: 'delete', statusCode: 401 },
      { path: '/api/auth/account', method: 'delete', statusCode: 404 },
      { path: '/api/auth/reset-password', method: 'post', statusCode: 400 },
      { path: '/api/auth/change-password', method: 'put', statusCode: 400 },
      { path: '/api/auth/change-password', method: 'put', statusCode: 401 },
      { path: '/api/auth/verify-email', method: 'post', statusCode: 400 },
      { path: '/api/auth/export-data', method: 'get', statusCode: 401 },
      { path: '/api/auth/export-data', method: 'get', statusCode: 404 },
      { path: '/api/auth/api-keys', method: 'post', statusCode: 400 },
      { path: '/api/auth/api-keys', method: 'post', statusCode: 401 },
      { path: '/api/auth/api-keys', method: 'get', statusCode: 401 },
      { path: '/api/auth/api-keys/{id}', method: 'delete', statusCode: 401 },
      { path: '/api/auth/api-keys/{id}', method: 'delete', statusCode: 404 },
      { path: '/api/chat/sessions', method: 'post', statusCode: 400 },
      { path: '/api/chat/sessions', method: 'post', statusCode: 401 },
      { path: '/api/chat/sessions', method: 'get', statusCode: 400 },
      { path: '/api/chat/sessions', method: 'get', statusCode: 401 },
      { path: '/api/chat/sessions/{id}', method: 'get', statusCode: 400 },
      { path: '/api/chat/sessions/{id}', method: 'get', statusCode: 401 },
      { path: '/api/chat/sessions/{id}', method: 'get', statusCode: 404 },
      { path: '/api/chat/sessions/{id}', method: 'delete', statusCode: 400 },
      { path: '/api/chat/sessions/{id}', method: 'delete', statusCode: 401 },
      { path: '/api/chat/sessions/{id}', method: 'delete', statusCode: 404 },
      { path: '/api/chat/sessions/{id}/messages', method: 'post', statusCode: 400 },
      { path: '/api/chat/sessions/{id}/messages', method: 'post', statusCode: 401 },
      { path: '/api/chat/sessions/{id}/messages', method: 'post', statusCode: 404 },
      { path: '/api/chat/sessions/{id}/messages', method: 'post', statusCode: 409 },
      { path: '/api/chat/sessions/{id}/messages', method: 'post', statusCode: 429 },
      { path: '/api/chat/sessions/{id}/audio', method: 'post', statusCode: 400 },
      { path: '/api/chat/sessions/{id}/audio', method: 'post', statusCode: 401 },
      { path: '/api/chat/sessions/{id}/audio', method: 'post', statusCode: 404 },
      { path: '/api/chat/sessions/{id}/audio', method: 'post', statusCode: 409 },
      { path: '/api/chat/sessions/{id}/audio', method: 'post', statusCode: 429 },
      { path: '/api/chat/messages/{messageId}/report', method: 'post', statusCode: 400 },
      { path: '/api/chat/messages/{messageId}/report', method: 'post', statusCode: 401 },
      { path: '/api/chat/messages/{messageId}/report', method: 'post', statusCode: 404 },
      { path: '/api/chat/messages/{messageId}/image-url', method: 'post', statusCode: 400 },
      { path: '/api/chat/messages/{messageId}/image-url', method: 'post', statusCode: 401 },
      { path: '/api/chat/messages/{messageId}/image-url', method: 'post', statusCode: 404 },
      { path: '/api/chat/messages/{messageId}/tts', method: 'post', statusCode: 400 },
      { path: '/api/chat/messages/{messageId}/tts', method: 'post', statusCode: 401 },
      { path: '/api/chat/messages/{messageId}/tts', method: 'post', statusCode: 404 },
      { path: '/api/chat/messages/{messageId}/tts', method: 'post', statusCode: 501 },
      { path: '/api/chat/messages/{messageId}/image', method: 'get', statusCode: 400 },
      { path: '/api/chat/messages/{messageId}/image', method: 'get', statusCode: 404 },
    ];

    for (const endpoint of errorEndpoints) {
      assertMatchesOpenApiResponse({
        ...endpoint,
        payload: errorPayload,
      });
    }
  });
});
