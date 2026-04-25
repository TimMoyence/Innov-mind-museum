import { createE2EHarness, type E2EHarness } from 'tests/helpers/e2e/e2e-app-harness';
import { markEmailVerified } from 'tests/helpers/e2e/e2e-auth.helpers';

const shouldRunE2E = process.env.RUN_E2E === 'true';
const describeE2E = shouldRunE2E ? describe : describe.skip;

describeE2E('api e2e (express + postgres container)', () => {
  jest.setTimeout(180000);

  let harness: E2EHarness;
  let request: E2EHarness['request'];

  let isCreateSessionResponse: (value: unknown) => boolean;
  let isPostMessageResponse: (value: unknown) => boolean;
  let isPostAudioMessageResponse: (value: unknown) => boolean;
  let isGetSessionResponse: (value: unknown) => boolean;
  let isDeleteSessionResponse: (value: unknown) => boolean;
  let isListSessionsResponse: (value: unknown) => boolean;

  beforeAll(async () => {
    harness = await createE2EHarness();
    request = harness.request;

    const contracts = await import('@modules/chat/adapters/primary/http/chat.contracts');
    isCreateSessionResponse = contracts.isCreateSessionResponse;
    isPostMessageResponse = contracts.isPostMessageResponse;
    isPostAudioMessageResponse = contracts.isPostAudioMessageResponse;
    isGetSessionResponse = contracts.isGetSessionResponse;
    isDeleteSessionResponse = contracts.isDeleteSessionResponse;
    isListSessionsResponse = contracts.isListSessionsResponse;
  });

  afterAll(async () => {
    if (harness) {
      await harness.stop();
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
        firstname: 'Tester',
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
    // E2E env has no SMTP — bypass verification email so login succeeds.
    await markEmailVerified(harness, email);

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
        lastname: 'EndToEnd',
      }),
    });
    expect(register.status).toBe(201);
    await markEmailVerified(harness, email);

    const login = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    expect(login.status).toBe(200);
    const token = (login.body as { accessToken?: string }).accessToken!;

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
        lastname: 'EndToEnd',
      }),
    });
    await markEmailVerified(harness, email);

    const login = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    expect(login.status).toBe(200);
    const token = (login.body as { accessToken?: string }).accessToken!;

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
      new Blob(
        [
          Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQMAAAAl21bKAAAAA1BMVEX///+nxBvIAAAAC0lEQVQI12NgAAIAAAUAAeImBZsAAAAASUVORK5CYII=',
            'base64',
          ),
        ],
        { type: 'image/png' },
      ),
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
        messages: {
          id: string;
          role: string;
          image?: { url: string; expiresAt: string } | null;
          imageRef?: string | null;
        }[];
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
        lastname: 'EndToEnd',
      }),
    });
    await markEmailVerified(harness, email);

    const login = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    const token = (login.body as { accessToken?: string }).accessToken!;

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
    const firstBefore = (listBefore.body as { sessions: { id: string }[] }).sessions[0]?.id;
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
    const firstAfter = (listAfter.body as { sessions: { id: string }[] }).sessions[0]?.id;
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
    await markEmailVerified(harness, email);

    const login = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    expect(login.status).toBe(200);
    const token = (login.body as { accessToken?: string }).accessToken!;

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
