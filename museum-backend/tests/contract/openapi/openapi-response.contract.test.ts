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
      },
    };
    const authMePayload = {
      user: authSessionPayload.user,
    };

    assertMatchesOpenApiResponse({
      path: '/api/auth/register',
      method: 'post',
      statusCode: 201,
      payload: undefined,
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
});

