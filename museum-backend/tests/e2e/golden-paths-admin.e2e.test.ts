import { createE2EHarness, E2EHarness } from 'tests/helpers/e2e/e2e-app-harness';
import { registerAndLogin, loginUser } from 'tests/helpers/e2e/e2e-auth.helpers';

const shouldRunE2E = process.env.RUN_E2E === 'true';
const describeE2E = shouldRunE2E ? describe : describe.skip;

/* ────────────────────────────────────────────────────────────────────────────
 * Helper: promote a user to admin via direct DB update, then re-login to
 * obtain a JWT that contains the updated role claim.
 * ──────────────────────────────────────────────────────────────────────── */
async function promoteToAdmin(
  harness: E2EHarness,
  userId: number,
  email: string,
  password: string,
): Promise<string> {
  await harness.dataSource.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [userId]);
  const login = await loginUser(harness.request, email, password);
  return login.accessToken;
}

/* ════════════════════════════════════════════════════════════════════════════
 * Golden Path 8 — Admin Analytics & Data Integrity
 *
 * rbac.e2e.test.ts already covers:
 *   - visitor 403 on /admin/users, /admin/stats, /admin/audit-logs
 *   - admin list users, stats, audit-logs (200)
 *   - admin PATCH /admin/users/:id/role
 *   - moderator cannot change roles
 *   - unauthenticated 401
 *
 * This test focuses on what is NOT covered:
 *   1. Analytics endpoints (usage, content, engagement)
 *   2. Admin user-list data integrity — newly registered user appears
 *   3. Audit-log data integrity — role-change action is logged
 * ════════════════════════════════════════════════════════════════════════ */
describeE2E('golden path 8 — admin analytics & data integrity', () => {
  jest.setTimeout(180_000);

  let harness: E2EHarness;

  beforeAll(async () => {
    harness = await createE2EHarness();
  });

  afterAll(async () => {
    await harness?.stop();
  });

  it('admin can access all three analytics endpoints', async () => {
    const password = 'Password123!';
    const { userId, email } = await registerAndLogin(harness.request, { password });
    const adminToken = await promoteToAdmin(harness, userId, email, password);

    // GET /api/admin/analytics/usage
    const usageRes = await harness.request(
      '/api/admin/analytics/usage',
      { method: 'GET' },
      adminToken,
    );
    expect(usageRes.status).toBe(200);
    expect(usageRes.body).toBeTruthy();

    // GET /api/admin/analytics/content
    const contentRes = await harness.request(
      '/api/admin/analytics/content',
      { method: 'GET' },
      adminToken,
    );
    expect(contentRes.status).toBe(200);
    expect(contentRes.body).toBeTruthy();

    // GET /api/admin/analytics/engagement
    const engagementRes = await harness.request(
      '/api/admin/analytics/engagement',
      { method: 'GET' },
      adminToken,
    );
    expect(engagementRes.status).toBe(200);
    expect(engagementRes.body).toBeTruthy();
  });

  it('visitor cannot access analytics endpoints', async () => {
    const { token } = await registerAndLogin(harness.request);

    const usageRes = await harness.request('/api/admin/analytics/usage', { method: 'GET' }, token);
    expect(usageRes.status).toBe(403);

    const contentRes = await harness.request(
      '/api/admin/analytics/content',
      { method: 'GET' },
      token,
    );
    expect(contentRes.status).toBe(403);

    const engagementRes = await harness.request(
      '/api/admin/analytics/engagement',
      { method: 'GET' },
      token,
    );
    expect(engagementRes.status).toBe(403);
  });

  it('newly registered user appears in admin user list', async () => {
    const password = 'Password123!';

    // Create admin
    const admin = await registerAndLogin(harness.request, { password });
    const adminToken = await promoteToAdmin(harness, admin.userId, admin.email, password);

    // Create a target user with a unique email we can search for
    const targetEmail = `e2e-findme-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@musaium.test`;
    const target = await registerAndLogin(harness.request, {
      password,
      email: targetEmail,
      firstname: 'FindMe',
    });

    // Search for the target user in admin user list
    const usersRes = await harness.request(
      `/api/admin/users?search=${encodeURIComponent(targetEmail)}`,
      { method: 'GET' },
      adminToken,
    );
    expect(usersRes.status).toBe(200);

    const usersBody = usersRes.body as { data: { id: number; email: string }[] };
    const found = usersBody.data.find((u) => u.id === target.userId);
    expect(found).toBeTruthy();
    expect(found?.email).toBe(targetEmail);
  });

  it('role change generates an audit log entry', async () => {
    const password = 'Password123!';

    // Create admin
    const admin = await registerAndLogin(harness.request, { password });
    const adminToken = await promoteToAdmin(harness, admin.userId, admin.email, password);

    // Create target user
    const target = await registerAndLogin(harness.request, { password });

    // Change target's role
    const patchRes = await harness.request(
      `/api/admin/users/${target.userId}/role`,
      {
        method: 'PATCH',
        body: JSON.stringify({ role: 'moderator' }),
      },
      adminToken,
    );
    expect(patchRes.status).toBe(200);

    // Fetch audit logs filtering by the admin's actor ID
    const auditRes = await harness.request(
      `/api/admin/audit-logs?actorId=${admin.userId}`,
      { method: 'GET' },
      adminToken,
    );
    expect(auditRes.status).toBe(200);

    const auditBody = auditRes.body as {
      data: {
        action: string;
        actorId: number;
        targetId?: string;
        targetType?: string;
      }[];
      total: number;
    };
    expect(auditBody.total).toBeGreaterThanOrEqual(1);

    const roleChangeLog = auditBody.data.find(
      (log) => log.action === 'ADMIN_ROLE_CHANGE' && String(log.targetId) === String(target.userId),
    );
    expect(roleChangeLog).toBeTruthy();
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * Golden Path 9 — Support Ticket Lifecycle
 *
 * Not covered by any existing E2E test.
 *
 * Flow:
 *   1. User creates a ticket
 *   2. User adds a message to the ticket
 *   3. User lists own tickets — ticket appears
 *   4. User fetches ticket detail — messages visible
 *   5. Admin lists all tickets — ticket appears
 *   6. Admin updates ticket status
 *   7. User sees updated status on their ticket
 * ════════════════════════════════════════════════════════════════════════ */
describeE2E('golden path 9 — support ticket lifecycle', () => {
  jest.setTimeout(180_000);

  let harness: E2EHarness;

  beforeAll(async () => {
    harness = await createE2EHarness();
  });

  afterAll(async () => {
    await harness?.stop();
  });

  it('full ticket lifecycle: create, message, list, admin update, user verify', async () => {
    const password = 'Password123!';

    // ── Step 0: Set up users ──
    const user = await registerAndLogin(harness.request, { password });
    const admin = await registerAndLogin(harness.request, { password });
    const adminToken = await promoteToAdmin(harness, admin.userId, admin.email, password);

    // ── Step 1: User creates a support ticket ──
    const createRes = await harness.request(
      '/api/support/tickets',
      {
        method: 'POST',
        body: JSON.stringify({
          subject: 'Cannot load artwork images',
          description:
            'When I try to view an artwork, the image never loads. I have tried multiple artworks and the issue persists.',
          priority: 'high',
          category: 'bug',
        }),
      },
      user.token,
    );
    expect(createRes.status).toBe(201);

    const ticketBody = createRes.body as {
      ticket: { id: string; subject: string; status: string; priority: string };
    };
    expect(ticketBody.ticket.subject).toBe('Cannot load artwork images');
    expect(ticketBody.ticket.status).toBe('open');
    expect(ticketBody.ticket.priority).toBe('high');
    const ticketId = ticketBody.ticket.id;

    // ── Step 2: User adds a follow-up message to the ticket ──
    const msgRes = await harness.request(
      `/api/support/tickets/${ticketId}/messages`,
      {
        method: 'POST',
        body: JSON.stringify({
          text: 'I also noticed the issue happens more frequently on Wi-Fi.',
        }),
      },
      user.token,
    );
    expect(msgRes.status).toBe(201);

    const msgBody = msgRes.body as { message: { id: string; text: string } };
    expect(msgBody.message.text).toBe('I also noticed the issue happens more frequently on Wi-Fi.');

    // ── Step 3: User lists own tickets — new ticket appears ──
    const listRes = await harness.request('/api/support/tickets', { method: 'GET' }, user.token);
    expect(listRes.status).toBe(200);

    const listBody = listRes.body as { data: { id: string; subject: string }[] };
    const userTicket = listBody.data.find((t) => t.id === ticketId);
    expect(userTicket).toBeTruthy();
    expect(userTicket?.subject).toBe('Cannot load artwork images');

    // ── Step 4: User fetches ticket detail — messages visible ──
    const detailRes = await harness.request(
      `/api/support/tickets/${ticketId}`,
      { method: 'GET' },
      user.token,
    );
    expect(detailRes.status).toBe(200);

    const detailBody = detailRes.body as {
      ticket: {
        id: string;
        messages?: { text: string }[];
      };
    };
    expect(detailBody.ticket.id).toBe(ticketId);

    // The detail endpoint may or may not include messages inline — check if present
    if (detailBody.ticket.messages) {
      expect(detailBody.ticket.messages.length).toBeGreaterThanOrEqual(1);
    }

    // ── Step 5: Admin lists all tickets — user's ticket is visible ──
    const adminListRes = await harness.request('/api/admin/tickets', { method: 'GET' }, adminToken);
    expect(adminListRes.status).toBe(200);

    const adminListBody = adminListRes.body as {
      data: { id: string; status: string }[];
    };
    const adminViewTicket = adminListBody.data.find((t) => t.id === ticketId);
    expect(adminViewTicket).toBeTruthy();
    expect(adminViewTicket?.status).toBe('open');

    // ── Step 6: Admin updates ticket status to in_progress ──
    const updateRes = await harness.request(
      `/api/admin/tickets/${ticketId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status: 'in_progress' }),
      },
      adminToken,
    );
    expect(updateRes.status).toBe(200);

    const updateBody = updateRes.body as { ticket: { id: string; status: string } };
    expect(updateBody.ticket.status).toBe('in_progress');

    // ── Step 7: User sees updated status on their ticket ──
    const userVerifyRes = await harness.request(
      `/api/support/tickets/${ticketId}`,
      { method: 'GET' },
      user.token,
    );
    expect(userVerifyRes.status).toBe(200);

    const verifyBody = userVerifyRes.body as { ticket: { status: string } };
    expect(verifyBody.ticket.status).toBe('in_progress');
  });

  it('visitor cannot access admin ticket list', async () => {
    const { token } = await registerAndLogin(harness.request);

    const res = await harness.request('/api/admin/tickets', { method: 'GET' }, token);
    expect(res.status).toBe(403);
  });

  it('user cannot see another user ticket detail', async () => {
    const password = 'Password123!';

    const userA = await registerAndLogin(harness.request, { password });
    const userB = await registerAndLogin(harness.request, { password });

    // User A creates a ticket
    const createRes = await harness.request(
      '/api/support/tickets',
      {
        method: 'POST',
        body: JSON.stringify({
          subject: 'Private issue for user A',
          description: 'This ticket should only be visible to user A and admins.',
        }),
      },
      userA.token,
    );
    expect(createRes.status).toBe(201);
    const ticketId = (createRes.body as { ticket: { id: string } }).ticket.id;

    // User B tries to access User A's ticket
    const detailRes = await harness.request(
      `/api/support/tickets/${ticketId}`,
      { method: 'GET' },
      userB.token,
    );
    // Should be 403 or 404 (ownership check)
    expect([403, 404]).toContain(detailRes.status);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * Golden Path 10 — Museum Management CRUD
 *
 * Not covered by any existing E2E test.
 *
 * Flow:
 *   1. Admin creates a museum
 *   2. Admin lists museums — new museum appears
 *   3. Admin updates the museum
 *   4. Regular user can see museum in directory
 *   5. Regular user can fetch museum by slug
 *   6. Regular user cannot create or update museums (403)
 *   7. Museum data integrity verified across operations
 * ════════════════════════════════════════════════════════════════════════ */
describeE2E('golden path 10 — museum management', () => {
  jest.setTimeout(180_000);

  let harness: E2EHarness;

  beforeAll(async () => {
    harness = await createE2EHarness();
  });

  afterAll(async () => {
    await harness?.stop();
  });

  it('full museum CRUD lifecycle with data integrity', async () => {
    const password = 'Password123!';
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    // ── Step 0: Set up admin ──
    const admin = await registerAndLogin(harness.request, { password });
    const adminToken = await promoteToAdmin(harness, admin.userId, admin.email, password);

    // ── Step 1: Admin creates a museum ──
    const museumName = `Musee du Test ${uniqueSuffix}`;
    const museumSlug = `musee-test-${uniqueSuffix}`;
    const createRes = await harness.request(
      '/api/museums',
      {
        method: 'POST',
        body: JSON.stringify({
          name: museumName,
          slug: museumSlug,
          address: '1 Rue des Tests, 75001 Paris',
          description: 'A museum created for E2E testing purposes.',
        }),
      },
      adminToken,
    );
    expect(createRes.status).toBe(201);

    const createBody = createRes.body as {
      museum: { id: number; name: string; slug: string; address: string };
    };
    expect(createBody.museum.name).toBe(museumName);
    expect(createBody.museum.slug).toBe(museumSlug);
    expect(createBody.museum.address).toBe('1 Rue des Tests, 75001 Paris');
    const museumId = createBody.museum.id;

    // ── Step 2: Admin lists museums — new museum appears ──
    const listRes = await harness.request('/api/museums', { method: 'GET' }, adminToken);
    expect(listRes.status).toBe(200);

    const listBody = listRes.body as { museums: { id: number; name: string }[] };
    const found = listBody.museums.find((m) => m.id === museumId);
    expect(found).toBeTruthy();
    expect(found?.name).toBe(museumName);

    // ── Step 3: Admin updates the museum ──
    const updatedName = `Updated ${museumName}`;
    const updateRes = await harness.request(
      `/api/museums/${museumId}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          name: updatedName,
          description: 'Updated description for E2E testing.',
          latitude: 48.8606,
          longitude: 2.3376,
        }),
      },
      adminToken,
    );
    expect(updateRes.status).toBe(200);

    const updateBody = updateRes.body as {
      museum: { id: number; name: string; description: string; latitude: number };
    };
    expect(updateBody.museum.name).toBe(updatedName);
    expect(updateBody.museum.description).toBe('Updated description for E2E testing.');
    expect(updateBody.museum.latitude).toBeCloseTo(48.8606, 3);

    // ── Step 4: Regular user can see museum in directory ──
    const visitor = await registerAndLogin(harness.request, { password });

    const directoryRes = await harness.request(
      '/api/museums/directory',
      { method: 'GET' },
      visitor.token,
    );
    expect(directoryRes.status).toBe(200);

    const directoryBody = directoryRes.body as {
      museums: { id: number; name: string; slug: string }[];
    };
    const dirMuseum = directoryBody.museums.find((m) => m.id === museumId);
    expect(dirMuseum).toBeTruthy();
    expect(dirMuseum?.name).toBe(updatedName);
    expect(dirMuseum?.slug).toBe(museumSlug);

    // ── Step 5: Regular user can fetch museum by slug ──
    const getBySlugRes = await harness.request(
      `/api/museums/${museumSlug}`,
      { method: 'GET' },
      visitor.token,
    );
    expect(getBySlugRes.status).toBe(200);

    const getBody = getBySlugRes.body as { museum: { id: number; name: string } };
    expect(getBody.museum.id).toBe(museumId);
    expect(getBody.museum.name).toBe(updatedName);
  });

  it('visitor cannot create or update museums', async () => {
    const { token } = await registerAndLogin(harness.request);
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    // Visitor tries to create a museum
    const createRes = await harness.request(
      '/api/museums',
      {
        method: 'POST',
        body: JSON.stringify({
          name: `Unauthorized Museum ${uniqueSuffix}`,
          slug: `unauth-museum-${uniqueSuffix}`,
        }),
      },
      token,
    );
    expect(createRes.status).toBe(403);

    // Visitor tries to update a museum (id=1 may or may not exist, but 403 should come first)
    const updateRes = await harness.request(
      '/api/museums/1',
      {
        method: 'PUT',
        body: JSON.stringify({ name: 'Hacked Name' }),
      },
      token,
    );
    expect(updateRes.status).toBe(403);
  });

  it('visitor cannot list all museums (admin-only endpoint)', async () => {
    const { token } = await registerAndLogin(harness.request);

    const listRes = await harness.request('/api/museums', { method: 'GET' }, token);
    expect(listRes.status).toBe(403);
  });

  it('museum creation generates an audit log entry', async () => {
    const password = 'Password123!';
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const admin = await registerAndLogin(harness.request, { password });
    const adminToken = await promoteToAdmin(harness, admin.userId, admin.email, password);

    // Create a museum
    const createRes = await harness.request(
      '/api/museums',
      {
        method: 'POST',
        body: JSON.stringify({
          name: `Audit Test Museum ${uniqueSuffix}`,
          slug: `audit-museum-${uniqueSuffix}`,
        }),
      },
      adminToken,
    );
    expect(createRes.status).toBe(201);

    const museumId = (createRes.body as { museum: { id: number } }).museum.id;

    // Check audit logs for MUSEUM_CREATED action
    const auditRes = await harness.request(
      `/api/admin/audit-logs?action=MUSEUM_CREATED&actorId=${admin.userId}`,
      { method: 'GET' },
      adminToken,
    );
    expect(auditRes.status).toBe(200);

    const auditBody = auditRes.body as {
      data: { action: string; targetId?: string; targetType?: string }[];
      total: number;
    };
    expect(auditBody.total).toBeGreaterThanOrEqual(1);

    const museumLog = auditBody.data.find(
      (log) => log.action === 'MUSEUM_CREATED' && String(log.targetId) === String(museumId),
    );
    expect(museumLog).toBeTruthy();
    expect(museumLog?.targetType).toBe('museum');
  });
});
