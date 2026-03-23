import { createE2EHarness, E2EHarness } from 'tests/helpers/e2e/e2e-app-harness';
import { registerAndLogin, loginUser } from 'tests/helpers/e2e/e2e-auth.helpers';

const shouldRunE2E = process.env.RUN_E2E === 'true';
const describeE2E = shouldRunE2E ? describe : describe.skip;

describeE2E('rbac e2e (role-based access control)', () => {
  jest.setTimeout(180_000);

  let harness: E2EHarness;

  beforeAll(async () => {
    harness = await createE2EHarness();
  });

  afterAll(async () => {
    await harness?.stop();
  });

  it('visitor cannot access admin endpoints', async () => {
    const { token } = await registerAndLogin(harness.request);

    const usersRes = await harness.request(
      '/api/admin/users',
      { method: 'GET' },
      token,
    );
    expect(usersRes.status).toBe(403);
    expect(usersRes.body).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'FORBIDDEN' }),
      }),
    );

    const statsRes = await harness.request(
      '/api/admin/stats',
      { method: 'GET' },
      token,
    );
    expect(statsRes.status).toBe(403);

    const auditRes = await harness.request(
      '/api/admin/audit-logs',
      { method: 'GET' },
      token,
    );
    expect(auditRes.status).toBe(403);
  });

  it('admin can access admin endpoints after role promotion', async () => {
    const password = 'Password123!';
    const { token: visitorToken, userId, email } = await registerAndLogin(
      harness.request,
      { password },
    );

    // Verify visitor is blocked
    const beforeUsers = await harness.request(
      '/api/admin/users',
      { method: 'GET' },
      visitorToken,
    );
    expect(beforeUsers.status).toBe(403);

    // Promote user to admin via direct DB query
    await harness.dataSource.query(
      `UPDATE users SET role = 'admin' WHERE id = $1`,
      [userId],
    );

    // Re-login to get a fresh JWT with the updated role
    const login = await loginUser(harness.request, email, password);
    const adminToken = login.accessToken;

    // GET /api/admin/users should now succeed
    const usersRes = await harness.request(
      '/api/admin/users',
      { method: 'GET' },
      adminToken,
    );
    expect(usersRes.status).toBe(200);
    const usersBody = usersRes.body as { users?: unknown[]; total?: number };
    expect(Array.isArray(usersBody.users)).toBe(true);
    expect(typeof usersBody.total).toBe('number');

    // GET /api/admin/stats should succeed
    const statsRes = await harness.request(
      '/api/admin/stats',
      { method: 'GET' },
      adminToken,
    );
    expect(statsRes.status).toBe(200);

    // GET /api/admin/audit-logs should succeed
    const auditRes = await harness.request(
      '/api/admin/audit-logs',
      { method: 'GET' },
      adminToken,
    );
    expect(auditRes.status).toBe(200);
  });

  it('admin can change another user role via PATCH /api/admin/users/:id/role', async () => {
    const password = 'Password123!';

    // Create the admin user
    const admin = await registerAndLogin(harness.request, { password });
    await harness.dataSource.query(
      `UPDATE users SET role = 'admin' WHERE id = $1`,
      [admin.userId],
    );
    const adminLogin = await loginUser(harness.request, admin.email, password);
    const adminToken = adminLogin.accessToken;

    // Create a target visitor user
    const target = await registerAndLogin(harness.request, { password });

    // Promote target to moderator
    const patchRes = await harness.request(
      `/api/admin/users/${target.userId}/role`,
      {
        method: 'PATCH',
        body: JSON.stringify({ role: 'moderator' }),
      },
      adminToken,
    );
    expect(patchRes.status).toBe(200);
    const patchBody = patchRes.body as { user?: { role?: string } };
    expect(patchBody.user?.role).toBe('moderator');

    // Target re-logs in and can now access admin/users as moderator
    const modLogin = await loginUser(harness.request, target.email, password);
    const modToken = modLogin.accessToken;

    const modUsersRes = await harness.request(
      '/api/admin/users',
      { method: 'GET' },
      modToken,
    );
    expect(modUsersRes.status).toBe(200);
  });

  it('moderator cannot change user roles (admin-only)', async () => {
    const password = 'Password123!';

    // Create and promote to moderator via DB
    const mod = await registerAndLogin(harness.request, { password });
    await harness.dataSource.query(
      `UPDATE users SET role = 'moderator' WHERE id = $1`,
      [mod.userId],
    );
    const modLogin = await loginUser(harness.request, mod.email, password);
    const modToken = modLogin.accessToken;

    // Create target
    const target = await registerAndLogin(harness.request, { password });

    // Moderator tries to change role → should be 403
    const patchRes = await harness.request(
      `/api/admin/users/${target.userId}/role`,
      {
        method: 'PATCH',
        body: JSON.stringify({ role: 'admin' }),
      },
      modToken,
    );
    expect(patchRes.status).toBe(403);
  });

  it('unauthenticated requests to admin endpoints return 401', async () => {
    const usersRes = await harness.request('/api/admin/users', { method: 'GET' });
    expect(usersRes.status).toBe(401);

    const statsRes = await harness.request('/api/admin/stats', { method: 'GET' });
    expect(statsRes.status).toBe(401);
  });
});
