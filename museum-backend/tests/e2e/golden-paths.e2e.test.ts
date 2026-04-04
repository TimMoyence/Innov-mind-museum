import { createE2EHarness, E2EHarness } from 'tests/helpers/e2e/e2e-app-harness';
import { registerAndLogin } from 'tests/helpers/e2e/e2e-auth.helpers';

const shouldRunE2E = process.env.RUN_E2E === 'true';
const describeE2E = shouldRunE2E ? describe : describe.skip;

describeE2E('golden path e2e flows', () => {
  jest.setTimeout(180_000);

  let harness: E2EHarness;

  let isCreateSessionResponse: (value: unknown) => boolean;
  let isPostMessageResponse: (value: unknown) => boolean;
  let isPostAudioMessageResponse: (value: unknown) => boolean;
  let isGetSessionResponse: (value: unknown) => boolean;
  let isDeleteSessionResponse: (value: unknown) => boolean;
  let isListSessionsResponse: (value: unknown) => boolean;

  beforeAll(async () => {
    harness = await createE2EHarness();

    const contracts = await import('@modules/chat/adapters/primary/http/chat.contracts');
    isCreateSessionResponse = contracts.isCreateSessionResponse;
    isPostMessageResponse = contracts.isPostMessageResponse;
    isPostAudioMessageResponse = contracts.isPostAudioMessageResponse;
    isGetSessionResponse = contracts.isGetSessionResponse;
    isDeleteSessionResponse = contracts.isDeleteSessionResponse;
    isListSessionsResponse = contracts.isListSessionsResponse;
  });

  afterAll(async () => {
    await harness?.stop();
  });

  // ---------------------------------------------------------------------------
  // Golden Path 1: Register -> Login -> Create Session -> Send Text -> AI Response
  // ---------------------------------------------------------------------------
  describe('GP1: register -> login -> chat text flow', () => {
    const password = 'GoldenPath1!';
    let email: string;
    let accessToken: string;
    let refreshToken: string;
    let sessionId: string;

    it('registers a new user', async () => {
      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      email = `gp1-${uniqueSuffix}@musaium.test`;

      const res = await harness.request('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
          firstname: 'Golden',
          lastname: 'Path1',
        }),
      });

      expect(res.status).toBe(201);
      expect(res.body).toEqual(
        expect.objectContaining({
          user: expect.objectContaining({
            id: expect.any(Number),
            email,
          }),
        }),
      );
    });

    it('logs in with the registered credentials', async () => {
      const res = await harness.request('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      expect(res.status).toBe(200);
      const body = res.body as {
        accessToken: string;
        refreshToken: string;
        user: { email: string };
      };
      expect(typeof body.accessToken).toBe('string');
      expect(typeof body.refreshToken).toBe('string');
      expect(body.user.email).toBe(email);

      accessToken = body.accessToken;
      refreshToken = body.refreshToken;
    });

    it('verifies identity via /me', async () => {
      const res = await harness.request('/api/auth/me', { method: 'GET' }, accessToken);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(
        expect.objectContaining({
          user: expect.objectContaining({ email }),
        }),
      );
    });

    it('creates a chat session', async () => {
      const res = await harness.request(
        '/api/chat/sessions',
        {
          method: 'POST',
          body: JSON.stringify({ locale: 'en-US', museumMode: true }),
        },
        accessToken,
      );

      expect(res.status).toBe(201);
      expect(isCreateSessionResponse(res.body)).toBe(true);

      sessionId = (res.body as { session: { id: string } }).session.id;
      expect(typeof sessionId).toBe('string');
    });

    it('sends a text message and gets an assistant response', async () => {
      const res = await harness.request(
        `/api/chat/sessions/${sessionId}/messages`,
        {
          method: 'POST',
          body: JSON.stringify({
            text: 'Tell me about the Mona Lisa.',
            context: {
              museumMode: true,
              locale: 'en-US',
              guideLevel: 'beginner',
            },
          }),
        },
        accessToken,
      );

      expect(res.status).toBe(201);
      expect(isPostMessageResponse(res.body)).toBe(true);

      const body = res.body as {
        sessionId: string;
        message: { id: string; role: string; text: string; createdAt: string };
        metadata: Record<string, unknown>;
      };

      // Core assertions: assistant role, non-empty text, valid metadata
      expect(body.sessionId).toBe(sessionId);
      expect(body.message.role).toBe('assistant');
      expect(body.message.text.length).toBeGreaterThan(0);
      expect(typeof body.message.id).toBe('string');
      expect(typeof body.message.createdAt).toBe('string');
      expect(body.metadata).toEqual(expect.any(Object));
    });

    it('retrieves the session with both user and assistant messages', async () => {
      const res = await harness.request(
        `/api/chat/sessions/${sessionId}?limit=20`,
        { method: 'GET' },
        accessToken,
      );

      expect(res.status).toBe(200);
      expect(isGetSessionResponse(res.body)).toBe(true);

      const messages = (res.body as { messages: { role: string }[] }).messages;
      const roles = messages.map((m) => m.role);
      expect(roles).toContain('user');
      expect(roles).toContain('assistant');
    });

    it('refresh token works to get a new access token', async () => {
      const res = await harness.request('/api/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      });

      expect(res.status).toBe(200);
      expect(typeof (res.body as { accessToken: string }).accessToken).toBe('string');
    });
  });

  // ---------------------------------------------------------------------------
  // Golden Path 2: Photo Upload -> AI Contextual Response
  // ---------------------------------------------------------------------------
  describe('GP2: photo upload -> contextual AI response', () => {
    it('uploads an image and receives an assistant response acknowledging it', async () => {
      const { token } = await registerAndLogin(harness.request);

      // Create a session
      const createRes = await harness.request(
        '/api/chat/sessions',
        {
          method: 'POST',
          body: JSON.stringify({ locale: 'en-US', museumMode: true }),
        },
        token,
      );
      expect(createRes.status).toBe(201);
      const sessionId = (createRes.body as { session: { id: string } }).session.id;

      // Build a minimal 1x1 PNG buffer
      const pngHeader = Buffer.from('89504e470d0a1a0a', 'hex');

      // Upload image + text via multipart form
      const formData = new FormData();
      formData.append('image', new Blob([pngHeader], { type: 'image/png' }), 'artwork.png');
      formData.append(
        'context',
        JSON.stringify({
          museumMode: true,
          locale: 'en-US',
          guideLevel: 'beginner',
        }),
      );
      formData.append('text', 'What artwork is this?');

      const postRes = await harness.request(
        `/api/chat/sessions/${sessionId}/messages`,
        { method: 'POST', body: formData },
        token,
      );

      expect(postRes.status).toBe(201);
      expect(isPostMessageResponse(postRes.body)).toBe(true);

      const body = postRes.body as {
        message: { role: string; text: string };
      };
      expect(body.message.role).toBe('assistant');
      expect(body.message.text.length).toBeGreaterThan(0);

      // Verify the session contains the user image message
      const getRes = await harness.request(
        `/api/chat/sessions/${sessionId}?limit=20`,
        { method: 'GET' },
        token,
      );
      expect(getRes.status).toBe(200);
      expect(isGetSessionResponse(getRes.body)).toBe(true);

      const messages = (
        getRes.body as {
          messages: { role: string; imageRef?: string | null }[];
        }
      ).messages;

      // User message should have an image reference
      const userImageMsg = messages.find((m) => m.role === 'user' && m.imageRef);
      expect(userImageMsg).toBeTruthy();
    });
  });

  // ---------------------------------------------------------------------------
  // Golden Path 3: Audio -> Transcription -> AI Response
  // ---------------------------------------------------------------------------
  describe('GP3: audio upload -> transcription -> AI response', () => {
    it('uploads audio and receives transcription + assistant response', async () => {
      const { token } = await registerAndLogin(harness.request);

      // Create a session
      const createRes = await harness.request(
        '/api/chat/sessions',
        {
          method: 'POST',
          body: JSON.stringify({ locale: 'fr-FR', museumMode: true }),
        },
        token,
      );
      expect(createRes.status).toBe(201);
      const sessionId = (createRes.body as { session: { id: string } }).session.id;

      // Build a minimal audio payload (the harness fake transcriber accepts anything)
      const formData = new FormData();
      formData.append(
        'audio',
        new Blob([Buffer.from('fake-audio-binary-data')], {
          type: 'audio/mp4',
        }),
        'voice-note.m4a',
      );
      formData.append(
        'context',
        JSON.stringify({
          museumMode: true,
          locale: 'fr-FR',
          guideLevel: 'intermediate',
        }),
      );

      const postRes = await harness.request(
        `/api/chat/sessions/${sessionId}/audio`,
        { method: 'POST', body: formData },
        token,
      );

      expect(postRes.status).toBe(201);
      expect(isPostAudioMessageResponse(postRes.body)).toBe(true);

      const body = postRes.body as {
        sessionId: string;
        message: { id: string; role: string; text: string; createdAt: string };
        transcription: { text: string; model: string; provider: string };
        metadata: Record<string, unknown>;
      };

      // Transcription was produced
      expect(body.transcription.text).toBe('Transcribed voice question for e2e');
      expect(body.transcription.provider).toBe('openai');
      expect(typeof body.transcription.model).toBe('string');

      // Assistant responded
      expect(body.message.role).toBe('assistant');
      expect(body.message.text.length).toBeGreaterThan(0);
      expect(body.sessionId).toBe(sessionId);

      // Verify the session now contains messages
      const getRes = await harness.request(
        `/api/chat/sessions/${sessionId}?limit=20`,
        { method: 'GET' },
        token,
      );
      expect(getRes.status).toBe(200);
      const messages = (getRes.body as { messages: { role: string }[] }).messages;
      const roles = messages.map((m) => m.role);
      expect(roles).toContain('user');
      expect(roles).toContain('assistant');
    });
  });

  // ---------------------------------------------------------------------------
  // Golden Path 4: Session Lifecycle (create, list, delete, verify)
  // ---------------------------------------------------------------------------
  describe('GP4: session lifecycle — create, list, delete, verify', () => {
    let token: string;
    let sessionIds: string[];

    beforeAll(async () => {
      const auth = await registerAndLogin(harness.request);
      token = auth.token;
    });

    it('creates 3 sessions', async () => {
      sessionIds = [];

      for (let i = 0; i < 3; i++) {
        const res = await harness.request(
          '/api/chat/sessions',
          {
            method: 'POST',
            body: JSON.stringify({ locale: 'en-US', museumMode: true }),
          },
          token,
        );
        expect(res.status).toBe(201);
        expect(isCreateSessionResponse(res.body)).toBe(true);

        const id = (res.body as { session: { id: string } }).session.id;
        sessionIds.push(id);

        // Small delay to ensure distinct updatedAt ordering
        if (i < 2) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      }

      expect(sessionIds).toHaveLength(3);
    });

    it('lists sessions with correct count and newest-first ordering', async () => {
      const res = await harness.request('/api/chat/sessions?limit=20', { method: 'GET' }, token);

      expect(res.status).toBe(200);
      expect(isListSessionsResponse(res.body)).toBe(true);

      const body = res.body as {
        sessions: { id: string; updatedAt: string }[];
        page: { hasMore: boolean; limit: number };
      };

      // All 3 sessions are present
      expect(body.sessions.length).toBeGreaterThanOrEqual(3);
      const listedIds = body.sessions.map((s) => s.id);
      for (const id of sessionIds) {
        expect(listedIds).toContain(id);
      }

      // Newest first — updatedAt should be descending
      for (let i = 0; i < body.sessions.length - 1; i++) {
        const current = new Date(body.sessions[i].updatedAt).getTime();
        const next = new Date(body.sessions[i + 1].updatedAt).getTime();
        expect(current).toBeGreaterThanOrEqual(next);
      }

      // Pagination metadata is present
      expect(typeof body.page.hasMore).toBe('boolean');
      expect(typeof body.page.limit).toBe('number');
    });

    it('deletes the middle session', async () => {
      const targetId = sessionIds[1];

      const res = await harness.request(
        `/api/chat/sessions/${targetId}`,
        { method: 'DELETE' },
        token,
      );

      expect(res.status).toBe(200);
      expect(isDeleteSessionResponse(res.body)).toBe(true);
      expect(res.body).toEqual(
        expect.objectContaining({
          sessionId: targetId,
          deleted: true,
        }),
      );
    });

    it('deleted session is gone from the list', async () => {
      const res = await harness.request('/api/chat/sessions?limit=20', { method: 'GET' }, token);

      expect(res.status).toBe(200);
      const body = res.body as { sessions: { id: string }[] };
      const listedIds = body.sessions.map((s) => s.id);

      // Deleted session is absent
      expect(listedIds).not.toContain(sessionIds[1]);

      // Other two sessions remain
      expect(listedIds).toContain(sessionIds[0]);
      expect(listedIds).toContain(sessionIds[2]);
    });

    it('remaining sessions still work — can send a message', async () => {
      const targetId = sessionIds[2];

      const res = await harness.request(
        `/api/chat/sessions/${targetId}/messages`,
        {
          method: 'POST',
          body: JSON.stringify({
            text: 'Is this session still functional after sibling deletion?',
            context: {
              museumMode: true,
              locale: 'en-US',
              guideLevel: 'beginner',
            },
          }),
        },
        token,
      );

      expect(res.status).toBe(201);
      expect(isPostMessageResponse(res.body)).toBe(true);

      const body = res.body as {
        message: { role: string; text: string };
      };
      expect(body.message.role).toBe('assistant');
      expect(body.message.text.length).toBeGreaterThan(0);
    });

    it('deleted session returns 404 when accessed', async () => {
      const deletedId = sessionIds[1];

      const getRes = await harness.request(
        `/api/chat/sessions/${deletedId}?limit=20`,
        { method: 'GET' },
        token,
      );
      expect(getRes.status).toBe(404);

      const postRes = await harness.request(
        `/api/chat/sessions/${deletedId}/messages`,
        {
          method: 'POST',
          body: JSON.stringify({
            text: 'Should not work',
            context: { museumMode: true, locale: 'en-US', guideLevel: 'beginner' },
          }),
        },
        token,
      );
      expect(postRes.status).toBe(404);
    });
  });
});
