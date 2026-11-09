import { createE2EHarness, type E2EHarness } from 'tests/helpers/e2e/e2e-app-harness';
import { registerAndLogin, loginUser } from 'tests/helpers/e2e/e2e-auth.helpers';

const shouldRunE2E = process.env.RUN_E2E === 'true' || process.env.RUN_INTEGRATION === 'true';
const describeE2E = shouldRunE2E ? describe : describe.skip;

describeE2E('IDOR matrix — cross-user + admin access per resource', () => {
  let harness: E2EHarness;

  beforeAll(async () => {
    harness = await createE2EHarness();
  });

  afterAll(async () => {
    await harness?.stop();
  });

  describe('chat session owned by user A', () => {
    it('cross-user GET/DELETE returns 404, owner gets 200', async () => {
      const userA = await registerAndLogin(harness);
      const userB = await registerAndLogin(harness);

      const created = await harness.request(
        '/api/chat/sessions',
        {
          method: 'POST',
          body: JSON.stringify({ locale: 'en', museumMode: true }),
        },
        userA.token,
      );
      expect(created.status).toBe(201);
      const sessionId = (created.body as { session: { id: string } }).session.id;

      const getCross = await harness.request(
        `/api/chat/sessions/${sessionId}?limit=20`,
        { method: 'GET' },
        userB.token,
      );
      expect(getCross.status).toBe(404);

      const deleteCross = await harness.request(
        `/api/chat/sessions/${sessionId}`,
        { method: 'DELETE' },
        userB.token,
      );
      expect(deleteCross.status).toBe(404);

      const getOwn = await harness.request(
        `/api/chat/sessions/${sessionId}?limit=20`,
        { method: 'GET' },
        userA.token,
      );
      expect(getOwn.status).toBe(200);
    });

    it('admin GET /api/admin/chat/sessions/:id returns 200 with owner content; non-admin gets 403', async () => {
      const password = 'Password123!';
      const userA = await registerAndLogin(harness, { password });
      const userB = await registerAndLogin(harness, { password });
      const admin = await registerAndLogin(harness, { password });

      await harness.dataSource.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [
        admin.userId,
      ]);
      const adminLogin = await loginUser(harness.request, admin.email, password);

      const created = await harness.request(
        '/api/chat/sessions',
        {
          method: 'POST',
          body: JSON.stringify({ locale: 'en', museumMode: true }),
        },
        userA.token,
      );
      expect(created.status).toBe(201);
      const sessionId = (created.body as { session: { id: string } }).session.id;

      const getAdmin = await harness.request(
        `/api/admin/chat/sessions/${sessionId}`,
        { method: 'GET' },
        adminLogin.accessToken,
      );
      expect(getAdmin.status).toBe(200);
      const adminBody = getAdmin.body as {
        session: { id: string };
        messages: unknown[];
      };
      expect(adminBody.session.id).toBe(sessionId);
      expect(Array.isArray(adminBody.messages)).toBe(true);

      const getNonAdmin = await harness.request(
        `/api/admin/chat/sessions/${sessionId}`,
        { method: 'GET' },
        userB.token,
      );
      expect(getNonAdmin.status).toBe(403);
    });
  });

  describe('chat message owned by user A', () => {
    let sessionId: string;
    let messageId: string;
    let userAToken: string;
    let userBToken: string;

    beforeAll(async () => {
      const userA = await registerAndLogin(harness);
      const userB = await registerAndLogin(harness);
      userAToken = userA.token;
      userBToken = userB.token;

      const created = await harness.request(
        '/api/chat/sessions',
        {
          method: 'POST',
          body: JSON.stringify({ locale: 'en', museumMode: true }),
        },
        userAToken,
      );
      sessionId = (created.body as { session: { id: string } }).session.id;

      const posted = await harness.request(
        `/api/chat/sessions/${sessionId}/messages`,
        {
          method: 'POST',
          body: JSON.stringify({
            text: 'Tell me about impressionism',
            context: { museumMode: true, locale: 'en', guideLevel: 'beginner' },
          }),
        },
        userAToken,
      );
      const body = posted.body as { message: { id: string; role: string } };
      messageId = body.message.id;
    });

    it('cross-user POST /messages/:messageId/report returns 404', async () => {
      const res = await harness.request(
        `/api/chat/messages/${messageId}/report`,
        {
          method: 'POST',
          body: JSON.stringify({ reason: 'inaccurate' }),
        },
        userBToken,
      );
      expect(res.status).toBe(404);
    });

    it('cross-user POST /messages/:messageId/feedback returns 404', async () => {
      const res = await harness.request(
        `/api/chat/messages/${messageId}/feedback`,
        {
          method: 'POST',
          body: JSON.stringify({ value: 'positive' }),
        },
        userBToken,
      );
      expect(res.status).toBe(404);
    });

    it('cross-user POST /messages/:messageId/image-url returns 404', async () => {
      const res = await harness.request(
        `/api/chat/messages/${messageId}/image-url`,
        { method: 'POST' },
        userBToken,
      );
      expect(res.status).toBe(404);
    });

    it('cross-user POST /messages/:messageId/tts returns 404', async () => {
      const grant = await harness.request(
        '/api/auth/consent',
        {
          method: 'POST',
          body: JSON.stringify({
            scope: 'third_party_ai_audio_openai',
            version: '2026-04-24',
          }),
        },
        userBToken,
      );
      expect(grant.status).toBe(201);

      const res = await harness.request(
        `/api/chat/messages/${messageId}/tts`,
        { method: 'POST' },
        userBToken,
      );
      expect(res.status).toBe(404);
    });

    it('GET /messages/:messageId/image (signed URL) rejects without a valid signature', async () => {
      const res = await harness.request(`/api/chat/messages/${messageId}/image`, {
        method: 'GET',
      });
      expect(res.status).toBe(400);
    });
  });

  describe('support ticket owned by user A', () => {
    it('cross-user gets 403, admin gets 200', async () => {
      const password = 'Password123!';
      const userA = await registerAndLogin(harness, { password });
      const userB = await registerAndLogin(harness, { password });
      const admin = await registerAndLogin(harness, { password });

      await harness.dataSource.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [
        admin.userId,
      ]);
      const adminLogin = await loginUser(harness.request, admin.email, password);

      const created = await harness.request(
        '/api/support/tickets',
        {
          method: 'POST',
          body: JSON.stringify({
            subject: 'Need help with photo upload',
            description: 'A sufficiently detailed description of my support issue.',
          }),
        },
        userA.token,
      );
      expect(created.status).toBe(201);
      const ticketId = (created.body as { ticket: { id: string } }).ticket.id;

      const getCross = await harness.request(
        `/api/support/tickets/${ticketId}`,
        { method: 'GET' },
        userB.token,
      );
      expect(getCross.status).toBe(403);

      const addCross = await harness.request(
        `/api/support/tickets/${ticketId}/messages`,
        {
          method: 'POST',
          body: JSON.stringify({ text: 'Impersonating the support request' }),
        },
        userB.token,
      );
      expect(addCross.status).toBe(403);

      const getAdmin = await harness.request(
        `/api/support/tickets/${ticketId}`,
        { method: 'GET' },
        adminLogin.accessToken,
      );
      expect(getAdmin.status).toBe(200);

      const addAdmin = await harness.request(
        `/api/support/tickets/${ticketId}/messages`,
        {
          method: 'POST',
          body: JSON.stringify({ text: 'Admin replying to the ticket' }),
        },
        adminLogin.accessToken,
      );
      expect(addAdmin.status).toBe(201);
    });
  });

  describe('consent scoped by JWT sub', () => {
    it('DELETE /api/auth/consent/:scope only revokes the caller own grant', async () => {
      const userA = await registerAndLogin(harness);
      const userB = await registerAndLogin(harness);

      await harness.request(
        '/api/auth/consent',
        {
          method: 'POST',
          body: JSON.stringify({ scope: 'location_to_llm', version: '2026-04-24' }),
        },
        userA.token,
      );
      await harness.request(
        '/api/auth/consent',
        {
          method: 'POST',
          body: JSON.stringify({ scope: 'location_to_llm', version: '2026-04-24' }),
        },
        userB.token,
      );

      const revoke = await harness.request(
        '/api/auth/consent/location_to_llm',
        { method: 'DELETE' },
        userA.token,
      );
      expect(revoke.status).toBe(200);

      const listB = await harness.request('/api/auth/consent', { method: 'GET' }, userB.token);
      expect(listB.status).toBe(200);
      const consentsB = (listB.body as { consents: { scope: string; revokedAt: string | null }[] })
        .consents;
      const activeB = consentsB.find((c) => c.scope === 'location_to_llm' && c.revokedAt === null);
      expect(activeB).toBeDefined();
    });
  });
});
