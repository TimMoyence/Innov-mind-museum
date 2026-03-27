import type { Server } from 'http';
import type { AddressInfo } from 'net';
import type { DataSource } from 'typeorm';

import {
  StartedPostgresTestContainer,
  startPostgresTestContainer,
} from 'tests/helpers/e2e/postgres-testcontainer';

const shouldRunE2E = process.env.RUN_E2E === 'true';
const describeE2E = shouldRunE2E ? describe : describe.skip;

describeE2E('api e2e (express + postgres container)', () => {
  jest.setTimeout(180000);

  let postgresContainer: StartedPostgresTestContainer;
  let appDataSource: DataSource;
  let server: Server;
  let baseUrl = '';

  let isCreateSessionResponse: (value: unknown) => boolean;
  let isPostMessageResponse: (value: unknown) => boolean;
  let isPostAudioMessageResponse: (value: unknown) => boolean;
  let isGetSessionResponse: (value: unknown) => boolean;
  let isDeleteSessionResponse: (value: unknown) => boolean;
  let isListSessionsResponse: (value: unknown) => boolean;

  const request = async (
    path: string,
    init: RequestInit = {},
    token?: string,
  ): Promise<{ status: number; body: unknown }> => {
    const headers = new Headers(init.headers || undefined);

    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    if (typeof init.body === 'string' && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers,
    });

    const rawBody = await response.text();
    let body: unknown = rawBody || null;

    if (rawBody) {
      try {
        body = JSON.parse(rawBody);
      } catch {
        body = rawBody;
      }
    }

    return { status: response.status, body };
  };

  beforeAll(async () => {
    postgresContainer = await startPostgresTestContainer();

    process.env.NODE_ENV = 'test';
    process.env.PORT = '0';
    process.env.TRUST_PROXY = 'false';
    process.env.CORS_ORIGINS = 'http://localhost:8081';
    process.env.DB_HOST = postgresContainer.host;
    process.env.DB_PORT = String(postgresContainer.port);
    process.env.DB_USER = postgresContainer.user;
    process.env.DB_PASSWORD = postgresContainer.password;
    process.env.PGDATABASE = postgresContainer.database;
    process.env.DB_SYNCHRONIZE = 'false';
    process.env.JWT_ACCESS_SECRET = 'e2e-access-secret';
    process.env.JWT_REFRESH_SECRET = 'e2e-refresh-secret';
    process.env.RATE_LIMIT_IP = '1000';
    process.env.RATE_LIMIT_SESSION = '1000';
    process.env.LLM_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'e2e-fake-openai-key';

    const [
      { createApp },
      { AppDataSource },
      { InitDatabase1771427010387 },
      { AddAuthRefreshTokens1771800000000 },
      { EnsureChatTables1771900000000 },
      { DropLegacyImageInsightTables1772000000000 },
      { FixChatSessionsUserFk1772000000001 },
      { AddMuseumContextToSessions1772000000002 },
      { AddMessageReports1773820507870 },
      { AddSocialAccountsAndNullablePassword1773823617791 },
      { AddSessionVersionColumn1774000000000 },
      { RecreateRefreshTokenIndexes1773852493401 },
      { ChatService },
      { TypeOrmChatRepository },
      { LocalImageStorage },
      contracts,
    ] = await Promise.all([
      import('@src/app'),
      import('@src/data/db/data-source'),
      import('@src/data/db/migrations/1771427010387-InitDatabase'),
      import('@src/data/db/migrations/1771800000000-AddAuthRefreshTokens'),
      import('@src/data/db/migrations/1771900000000-EnsureChatTables'),
      import('@src/data/db/migrations/1772000000000-DropLegacyImageInsightTables'),
      import('@src/data/db/migrations/1772000000001-FixChatSessionsUserFk'),
      import('@src/data/db/migrations/1772000000002-AddMuseumContextToSessions'),
      import('@src/data/db/migrations/1773820507870-AddMessageReports'),
      import('@src/data/db/migrations/1773823617791-AddSocialAccountsAndNullablePassword'),
      import('@src/data/db/migrations/1774000000000-AddSessionVersionColumn'),
      import('@src/data/db/migrations/1773852493401-RecreateRefreshTokenIndexes'),
      import('@modules/chat/application/chat.service'),
      import('@modules/chat/infrastructure/chat.repository.typeorm'),
      import('@modules/chat/adapters/secondary/image-storage.stub'),
      import('@modules/chat/adapters/primary/http/chat.contracts'),
    ]);

    isCreateSessionResponse = contracts.isCreateSessionResponse;
    isPostMessageResponse = contracts.isPostMessageResponse;
    isPostAudioMessageResponse = contracts.isPostAudioMessageResponse;
    isGetSessionResponse = contracts.isGetSessionResponse;
    isDeleteSessionResponse = contracts.isDeleteSessionResponse;
    isListSessionsResponse = contracts.isListSessionsResponse;

    appDataSource = AppDataSource;
    (appDataSource.options as { migrations?: unknown[] }).migrations = [
      InitDatabase1771427010387,
      AddAuthRefreshTokens1771800000000,
      EnsureChatTables1771900000000,
      DropLegacyImageInsightTables1772000000000,
      FixChatSessionsUserFk1772000000001,
      AddMuseumContextToSessions1772000000002,
      AddMessageReports1773820507870,
      AddSocialAccountsAndNullablePassword1773823617791,
      AddSessionVersionColumn1774000000000,
      RecreateRefreshTokenIndexes1773852493401,
    ];
    await appDataSource.initialize();
    (
      appDataSource.driver as {
        master?: { on?: (event: string, listener: () => void) => void };
      }
    ).master?.on?.('error', () => undefined);
    await appDataSource.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await appDataSource.runMigrations();

    const chatService = new ChatService({
      repository: new TypeOrmChatRepository(appDataSource),
      orchestrator: {
        async generate() {
          return {
            text: 'Synthetic assistant response for e2e',
            metadata: {
              citations: ['e2e'],
            },
          };
        },
        async generateStream(_input: unknown, onChunk: (t: string) => void) {
          const result = {
            text: 'Synthetic assistant response for e2e',
            metadata: { citations: ['e2e'] },
          };
          onChunk(result.text);
          return result;
        },
      },
      imageStorage: new LocalImageStorage(),
      audioTranscriber: {
        async transcribe() {
          return {
            text: 'Transcribed voice question for e2e',
            model: 'e2e-audio-model',
            provider: 'openai' as const,
          };
        },
      },
    });

    const app = createApp({ chatService });
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });

    const address = server.address() as AddressInfo | null;
    if (!address) {
      throw new Error('Could not determine server address for e2e tests');
    }

    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }

    if (appDataSource?.isInitialized) {
      await appDataSource.destroy();
    }

    if (postgresContainer) {
      postgresContainer.scheduleStop();
    }
  });

  it('returns healthy status on /api/health', async () => {
    const response = await request('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        status: 'ok',
        checks: expect.objectContaining({
          database: 'up',
          llmConfigured: true,
        }),
      }),
    );
  });

  it('supports full auth + chat flow with runtime contract validation', async () => {
    const email = `e2e-${Date.now()}@musaium.test`;
    const password = 'Password123!';

    const register = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
        firstname: 'E2E',
        lastname: 'User',
      }),
    });

    expect(register.status).toBe(201);
    expect(register.body).toEqual(
      expect.objectContaining({
        user: expect.objectContaining({
          id: expect.any(Number),
          email,
        }),
      }),
    );

    const login = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    expect(login.status).toBe(200);
    const loginBody = login.body as {
      accessToken?: unknown;
      refreshToken?: unknown;
      user?: { email?: unknown };
    };
    expect(typeof loginBody.accessToken).toBe('string');
    expect(typeof loginBody.refreshToken).toBe('string');
    expect(loginBody.user?.email).toBe(email);
    const accessToken = loginBody.accessToken as string;
    const refreshToken = loginBody.refreshToken as string;

    const me = await request('/api/auth/me', { method: 'GET' }, accessToken);
    expect(me.status).toBe(200);
    expect(me.body).toEqual(
      expect.objectContaining({
        user: expect.objectContaining({
          email,
        }),
      }),
    );

    const refresh = await request('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    });
    expect(refresh.status).toBe(200);
    expect((refresh.body as { accessToken?: unknown }).accessToken).toEqual(expect.any(String));

    const createSession = await request(
      '/api/chat/sessions',
      {
        method: 'POST',
        body: JSON.stringify({
          locale: 'en-US',
          museumMode: true,
        }),
      },
      accessToken,
    );

    expect(createSession.status).toBe(201);
    expect(isCreateSessionResponse(createSession.body)).toBe(true);

    const sessionId = (createSession.body as { session: { id: string } }).session.id;

    const postMessage = await request(
      `/api/chat/sessions/${sessionId}/messages`,
      {
        method: 'POST',
        body: JSON.stringify({
          text: 'Tell me about this artwork.',
          context: {
            museumMode: true,
            locale: 'en-US',
            guideLevel: 'beginner',
          },
        }),
      },
      accessToken,
    );

    expect(postMessage.status).toBe(201);
    expect(isPostMessageResponse(postMessage.body)).toBe(true);

    const getSession = await request(
      `/api/chat/sessions/${sessionId}?limit=20`,
      {
        method: 'GET',
      },
      accessToken,
    );

    expect(getSession.status).toBe(200);
    expect(isGetSessionResponse(getSession.body)).toBe(true);

    const listSessions = await request(
      '/api/chat/sessions?limit=20',
      { method: 'GET' },
      accessToken,
    );

    expect(listSessions.status).toBe(200);
    expect(isListSessionsResponse(listSessions.body)).toBe(true);
    expect(listSessions.body).toEqual(
      expect.objectContaining({
        sessions: expect.arrayContaining([
          expect.objectContaining({
            id: sessionId,
          }),
        ]),
      }),
    );
  });

  it('accepts audio upload route and returns assistant response + transcription', async () => {
    const email = `e2e-audio-${Date.now()}@musaium.test`;
    const password = 'Password123!';

    const register = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
        firstname: 'Audio',
        lastname: 'E2E',
      }),
    });
    expect(register.status).toBe(201);

    const login = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    expect(login.status).toBe(200);
    const token = (login.body as { accessToken?: string }).accessToken as string;

    const createSession = await request(
      '/api/chat/sessions',
      {
        method: 'POST',
        body: JSON.stringify({
          locale: 'fr-FR',
          museumMode: true,
        }),
      },
      token,
    );
    expect(createSession.status).toBe(201);
    const sessionId = (createSession.body as { session: { id: string } }).session.id;

    const formData = new FormData();
    formData.append(
      'audio',
      new Blob([Buffer.from('e2e-audio-binary')], { type: 'audio/mp4' }),
      'voice-note.m4a',
    );
    formData.append(
      'context',
      JSON.stringify({
        museumMode: true,
        locale: 'fr-FR',
        guideLevel: 'beginner',
      }),
    );

    const postAudio = await request(
      `/api/chat/sessions/${sessionId}/audio`,
      {
        method: 'POST',
        body: formData,
      },
      token,
    );

    expect(postAudio.status).toBe(201);
    expect(isPostAudioMessageResponse(postAudio.body)).toBe(true);
    expect(postAudio.body).toEqual(
      expect.objectContaining({
        transcription: expect.objectContaining({
          text: 'Transcribed voice question for e2e',
          provider: 'openai',
        }),
      }),
    );
  });

  it('returns signed image URLs for uploaded images and serves image bytes', async () => {
    const email = `e2e-image-${Date.now()}@musaium.test`;
    const password = 'Password123!';

    await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
        firstname: 'Image',
        lastname: 'E2E',
      }),
    });

    const login = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    expect(login.status).toBe(200);
    const token = (login.body as { accessToken?: string }).accessToken as string;

    const createSession = await request(
      '/api/chat/sessions',
      {
        method: 'POST',
        body: JSON.stringify({
          locale: 'en-US',
          museumMode: true,
        }),
      },
      token,
    );
    expect(createSession.status).toBe(201);
    const sessionId = (createSession.body as { session: { id: string } }).session.id;

    const formData = new FormData();
    formData.append(
      'image',
      new Blob([Buffer.from('89504e470d0a1a0a', 'hex')], { type: 'image/png' }),
      'mini.png',
    );
    formData.append(
      'context',
      JSON.stringify({
        museumMode: true,
        locale: 'en-US',
        guideLevel: 'beginner',
      }),
    );
    formData.append('text', 'Can you inspect this artwork image?');

    const postMessage = await request(
      `/api/chat/sessions/${sessionId}/messages`,
      {
        method: 'POST',
        body: formData,
      },
      token,
    );
    expect(postMessage.status).toBe(201);
    expect(isPostMessageResponse(postMessage.body)).toBe(true);

    const getSession = await request(
      `/api/chat/sessions/${sessionId}?limit=20`,
      { method: 'GET' },
      token,
    );
    expect(getSession.status).toBe(200);
    expect(isGetSessionResponse(getSession.body)).toBe(true);

    const messages = (
      getSession.body as {
        messages: Array<{
          id: string;
          role: string;
          image?: { url: string; expiresAt: string } | null;
          imageRef?: string | null;
        }>;
      }
    ).messages;
    const userImageMessage = messages.find(
      (message) => message.role === 'user' && message.imageRef,
    );
    expect(userImageMessage).toBeTruthy();
    expect(userImageMessage?.image?.url).toEqual(expect.any(String));

    const renew = await request(
      `/api/chat/messages/${userImageMessage!.id}/image-url`,
      { method: 'POST' },
      token,
    );
    expect(renew.status).toBe(200);
    expect(renew.body).toEqual(
      expect.objectContaining({
        url: expect.any(String),
        expiresAt: expect.any(String),
      }),
    );

    const imageResponse = await fetch((renew.body as { url: string }).url);
    expect(imageResponse.status).toBe(200);
    expect(imageResponse.headers.get('content-type')).toBe('image/png');
    const bytes = await imageResponse.arrayBuffer();
    expect(bytes.byteLength).toBeGreaterThan(0);
  });

  it('keeps the most recently active session first in session list', async () => {
    const email = `e2e-recency-${Date.now()}@musaium.test`;
    const password = 'Password123!';

    await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
        firstname: 'Recency',
        lastname: 'E2E',
      }),
    });

    const login = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    const token = (login.body as { accessToken?: string }).accessToken as string;

    const createA = await request(
      '/api/chat/sessions',
      {
        method: 'POST',
        body: JSON.stringify({ locale: 'en-US', museumMode: true }),
      },
      token,
    );
    const sessionA = (createA.body as { session: { id: string } }).session.id;

    await new Promise((resolve) => setTimeout(resolve, 10));

    const createB = await request(
      '/api/chat/sessions',
      {
        method: 'POST',
        body: JSON.stringify({ locale: 'en-US', museumMode: true }),
      },
      token,
    );
    const sessionB = (createB.body as { session: { id: string } }).session.id;

    const listBefore = await request('/api/chat/sessions?limit=20', { method: 'GET' }, token);
    expect(listBefore.status).toBe(200);
    const firstBefore = (listBefore.body as { sessions: Array<{ id: string }> }).sessions[0]?.id;
    expect(firstBefore).toBe(sessionB);

    const postToA = await request(
      `/api/chat/sessions/${sessionA}/messages`,
      {
        method: 'POST',
        body: JSON.stringify({
          text: 'Reactivate older session with a new message.',
          context: { locale: 'en-US', museumMode: true, guideLevel: 'beginner' },
        }),
      },
      token,
    );
    expect(postToA.status).toBe(201);

    const listAfter = await request('/api/chat/sessions?limit=20', { method: 'GET' }, token);
    expect(listAfter.status).toBe(200);
    const firstAfter = (listAfter.body as { sessions: Array<{ id: string }> }).sessions[0]?.id;
    expect(firstAfter).toBe(sessionA);
  });

  it('deletes an empty chat session and keeps non-empty session', async () => {
    const email = `e2e-delete-${Date.now()}@musaium.test`;
    const password = 'Password123!';

    const register = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
        firstname: 'Delete',
        lastname: 'Case',
      }),
    });
    expect(register.status).toBe(201);

    const login = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    expect(login.status).toBe(200);
    const token = (login.body as { accessToken?: string }).accessToken as string;

    const createEmpty = await request(
      '/api/chat/sessions',
      {
        method: 'POST',
        body: JSON.stringify({
          locale: 'en-US',
          museumMode: true,
        }),
      },
      token,
    );
    expect(createEmpty.status).toBe(201);
    const emptySessionId = (createEmpty.body as { session: { id: string } }).session.id;

    const createNonEmpty = await request(
      '/api/chat/sessions',
      {
        method: 'POST',
        body: JSON.stringify({
          locale: 'en-US',
          museumMode: true,
        }),
      },
      token,
    );
    expect(createNonEmpty.status).toBe(201);
    const nonEmptySessionId = (createNonEmpty.body as { session: { id: string } }).session.id;

    const postMessage = await request(
      `/api/chat/sessions/${nonEmptySessionId}/messages`,
      {
        method: 'POST',
        body: JSON.stringify({
          text: 'Tell me about this artwork.',
          context: {
            museumMode: true,
            locale: 'en-US',
            guideLevel: 'beginner',
          },
        }),
      },
      token,
    );
    expect(postMessage.status).toBe(201);

    const deleteEmpty = await request(
      `/api/chat/sessions/${emptySessionId}`,
      {
        method: 'DELETE',
      },
      token,
    );
    expect(deleteEmpty.status).toBe(200);
    expect(isDeleteSessionResponse(deleteEmpty.body)).toBe(true);
    expect(deleteEmpty.body).toEqual(
      expect.objectContaining({
        sessionId: emptySessionId,
        deleted: true,
      }),
    );

    const deleteNonEmpty = await request(
      `/api/chat/sessions/${nonEmptySessionId}`,
      {
        method: 'DELETE',
      },
      token,
    );
    expect(deleteNonEmpty.status).toBe(200);
    expect(isDeleteSessionResponse(deleteNonEmpty.body)).toBe(true);
    expect(deleteNonEmpty.body).toEqual(
      expect.objectContaining({
        sessionId: nonEmptySessionId,
        deleted: false,
      }),
    );
  });

  it('rejects chat access without token', async () => {
    const response = await request('/api/chat/sessions', {
      method: 'GET',
    });

    expect(response.status).toBe(401);
    expect(response.body).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'UNAUTHORIZED',
        }),
      }),
    );
  });
});
