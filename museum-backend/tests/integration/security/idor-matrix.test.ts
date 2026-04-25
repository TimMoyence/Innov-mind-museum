import { createE2EHarness, type E2EHarness } from 'tests/helpers/e2e/e2e-app-harness';
import { registerAndLogin, loginUser } from 'tests/helpers/e2e/e2e-auth.helpers';

/**
 * IDOR security matrix — cross-user and admin access checks across every
 * resource endpoint that exposes a privileged identifier in its path.
 *
 * Ownership contract:
 *  - Chat session / message endpoints: cross-user returns 404 (not 403 — we
 *    deliberately avoid enumeration, see `session-access.ts`). There is NO
 *    admin bypass today; admin hits the same 404 (documented via test.todo).
 *  - Support tickets: cross-user returns 403, admin/moderator returns 200.
 *  - Consent: scoped by JWT `sub`, path `:scope` is non-enumerable per-user,
 *    so the IDOR surface is indirect — we still assert isolation.
 *
 * Runs only under `RUN_E2E=true` (like the other e2e suites) because it boots
 * a real Postgres testcontainer + full Express server. Use `pnpm test:e2e`.
 */

const shouldRunE2E = process.env.RUN_E2E === 'true';
const describeE2E = shouldRunE2E ? describe : describe.skip;

describeE2E('IDOR matrix — cross-user + admin access per resource', () => {
  jest.setTimeout(180_000);

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

      // User B → 404 on GET
      const getCross = await harness.request(
        `/api/chat/sessions/${sessionId}?limit=20`,
        { method: 'GET' },
        userB.token,
      );
      expect(getCross.status).toBe(404);

      // User B → 404 on DELETE
      const deleteCross = await harness.request(
        `/api/chat/sessions/${sessionId}`,
        { method: 'DELETE' },
        userB.token,
      );
      expect(deleteCross.status).toBe(404);

      // Owner → 200
      const getOwn = await harness.request(
        `/api/chat/sessions/${sessionId}?limit=20`,
        { method: 'GET' },
        userA.token,
      );
      expect(getOwn.status).toBe(200);
    });

    // No admin bypass exists today for chat sessions — admin also receives 404.
    // Documented as a product gap; flip to a positive assertion once the
    // moderation endpoint lands.
    test.todo('admin can GET any session (requires dedicated admin moderation endpoint)');
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
      // The assistant response is what carries the id we report/feedback on.
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
          body: JSON.stringify({ value: 'up' }),
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
      const res = await harness.request(
        `/api/chat/messages/${messageId}/tts`,
        { method: 'POST' },
        userBToken,
      );
      expect(res.status).toBe(404);
    });

    it('GET /messages/:messageId/image (signed URL) rejects without a valid signature', async () => {
      // This endpoint is open (no auth) but requires a signed token. Unsigned
      // access returns 400 by contract — asserting we cannot hit the image via
      // IDOR bypass by guessing ids.
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

      // Promote admin
      await harness.dataSource.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [
        admin.userId,
      ]);
      const adminLogin = await loginUser(harness.request, admin.email, password);

      // User A creates ticket
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

      // User B GET → 403
      const getCross = await harness.request(
        `/api/support/tickets/${ticketId}`,
        { method: 'GET' },
        userB.token,
      );
      expect(getCross.status).toBe(403);

      // User B add-message → 403
      const addCross = await harness.request(
        `/api/support/tickets/${ticketId}/messages`,
        {
          method: 'POST',
          body: JSON.stringify({ text: 'Impersonating the support request' }),
        },
        userB.token,
      );
      expect(addCross.status).toBe(403);

      // Admin GET → 200
      const getAdmin = await harness.request(
        `/api/support/tickets/${ticketId}`,
        { method: 'GET' },
        adminLogin.accessToken,
      );
      expect(getAdmin.status).toBe(200);

      // Admin add-message → 201
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

      // Both users grant the same scope
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

      // User A revokes — only affects A (path scope is not an identifier,
      // so IDOR via path substitution is structurally impossible).
      const revoke = await harness.request(
        '/api/auth/consent/location_to_llm',
        { method: 'DELETE' },
        userA.token,
      );
      expect(revoke.status).toBe(200);

      // User B listing still shows active consent.
      const listB = await harness.request('/api/auth/consent', { method: 'GET' }, userB.token);
      expect(listB.status).toBe(200);
      const consentsB = (listB.body as { consents: { scope: string; revokedAt: string | null }[] })
        .consents;
      const activeB = consentsB.find((c) => c.scope === 'location_to_llm' && c.revokedAt === null);
      expect(activeB).toBeDefined();
    });
  });
});
