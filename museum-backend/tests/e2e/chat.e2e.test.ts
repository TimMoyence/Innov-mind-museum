import { createE2EHarness, E2EHarness } from 'tests/helpers/e2e/e2e-app-harness';
import { registerAndLogin } from 'tests/helpers/e2e/e2e-auth.helpers';

const shouldRunE2E = process.env.RUN_E2E === 'true';
const describeE2E = shouldRunE2E ? describe : describe.skip;

describeE2E('chat e2e (session + message lifecycle)', () => {
  jest.setTimeout(180_000);

  let harness: E2EHarness;

  beforeAll(async () => {
    harness = await createE2EHarness();
  });

  afterAll(async () => {
    await harness?.stop();
  });

  it('creates a session, posts a message, reads session, lists sessions, and deletes', async () => {
    const { token } = await registerAndLogin(harness.request);

    // ── Create session ──
    const createRes = await harness.request(
      '/api/chat/sessions',
      {
        method: 'POST',
        body: JSON.stringify({ locale: 'en', museumMode: true }),
      },
      token,
    );
    expect(createRes.status).toBe(201);
    const session = (createRes.body as { session: { id: string } }).session;
    expect(session.id).toEqual(expect.any(String));

    // ── Post a text message ──
    const postRes = await harness.request(
      `/api/chat/sessions/${session.id}/messages`,
      {
        method: 'POST',
        body: JSON.stringify({
          text: 'Tell me about art',
          context: {
            museumMode: true,
            locale: 'en',
            guideLevel: 'beginner',
          },
        }),
      },
      token,
    );
    expect(postRes.status).toBe(201);
    const postBody = postRes.body as { message?: { id: string; text: string } };
    expect(postBody.message).toBeDefined();

    // ── Get session with messages ──
    const getRes = await harness.request(
      `/api/chat/sessions/${session.id}?limit=20`,
      { method: 'GET' },
      token,
    );
    expect(getRes.status).toBe(200);
    const getBody = getRes.body as {
      session: { id: string };
      messages: Array<{ role: string; text?: string }>;
    };
    expect(getBody.session.id).toBe(session.id);
    expect(getBody.messages.length).toBeGreaterThanOrEqual(2); // user + assistant

    // ── List sessions ──
    const listRes = await harness.request('/api/chat/sessions?limit=20', { method: 'GET' }, token);
    expect(listRes.status).toBe(200);
    const listBody = listRes.body as {
      sessions: Array<{ id: string }>;
    };
    expect(listBody.sessions.some((s) => s.id === session.id)).toBe(true);

    // ── Delete session with messages (should return deleted: false) ──
    const deleteRes = await harness.request(
      `/api/chat/sessions/${session.id}`,
      { method: 'DELETE' },
      token,
    );
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body).toEqual(
      expect.objectContaining({
        sessionId: session.id,
        deleted: false,
      }),
    );
  });

  it('deletes an empty session (deleted: true)', async () => {
    const { token } = await registerAndLogin(harness.request);

    const createRes = await harness.request(
      '/api/chat/sessions',
      {
        method: 'POST',
        body: JSON.stringify({ locale: 'fr', museumMode: false }),
      },
      token,
    );
    expect(createRes.status).toBe(201);
    const sessionId = (createRes.body as { session: { id: string } }).session.id;

    const deleteRes = await harness.request(
      `/api/chat/sessions/${sessionId}`,
      { method: 'DELETE' },
      token,
    );
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body).toEqual(
      expect.objectContaining({
        sessionId,
        deleted: true,
      }),
    );
  });

  it('rejects chat operations without a token', async () => {
    const listRes = await harness.request('/api/chat/sessions', { method: 'GET' });
    expect(listRes.status).toBe(401);

    const createRes = await harness.request('/api/chat/sessions', {
      method: 'POST',
      body: JSON.stringify({ locale: 'en', museumMode: true }),
    });
    expect(createRes.status).toBe(401);
  });

  it('creates multiple sessions and returns most recently active first', async () => {
    const { token } = await registerAndLogin(harness.request);

    // Create session A
    const createA = await harness.request(
      '/api/chat/sessions',
      {
        method: 'POST',
        body: JSON.stringify({ locale: 'en', museumMode: true }),
      },
      token,
    );
    const sessionA = (createA.body as { session: { id: string } }).session.id;

    await new Promise((resolve) => setTimeout(resolve, 10));

    // Create session B (newer)
    const createB = await harness.request(
      '/api/chat/sessions',
      {
        method: 'POST',
        body: JSON.stringify({ locale: 'en', museumMode: true }),
      },
      token,
    );
    const sessionB = (createB.body as { session: { id: string } }).session.id;

    // B should be first
    const listBefore = await harness.request(
      '/api/chat/sessions?limit=20',
      { method: 'GET' },
      token,
    );
    const sessionsBefore = (listBefore.body as { sessions: Array<{ id: string }> }).sessions;
    expect(sessionsBefore[0]?.id).toBe(sessionB);

    // Post to A → reactivates it
    await harness.request(
      `/api/chat/sessions/${sessionA}/messages`,
      {
        method: 'POST',
        body: JSON.stringify({
          text: 'Reactivate session A',
          context: { locale: 'en', museumMode: true, guideLevel: 'beginner' },
        }),
      },
      token,
    );

    // A should now be first
    const listAfter = await harness.request(
      '/api/chat/sessions?limit=20',
      { method: 'GET' },
      token,
    );
    const sessionsAfter = (listAfter.body as { sessions: Array<{ id: string }> }).sessions;
    expect(sessionsAfter[0]?.id).toBe(sessionA);
  });
});
