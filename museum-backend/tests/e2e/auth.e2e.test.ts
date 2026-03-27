import { createE2EHarness, E2EHarness } from 'tests/helpers/e2e/e2e-app-harness';
import { registerUser, registerAndLogin } from 'tests/helpers/e2e/e2e-auth.helpers';

const shouldRunE2E = process.env.RUN_E2E === 'true';
const describeE2E = shouldRunE2E ? describe : describe.skip;

describeE2E('auth e2e (full lifecycle)', () => {
  jest.setTimeout(180_000);

  let harness: E2EHarness;

  beforeAll(async () => {
    harness = await createE2EHarness();
  });

  afterAll(async () => {
    await harness?.stop();
  });

  it('registers a new user and returns 201 with { user: { id, email } }', async () => {
    const email = `e2e-auth-reg-${Date.now()}@musaium.test`;
    const res = await harness.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password: 'Password123!',
        firstname: 'Auth',
        lastname: 'Test',
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

  it('logs in and returns accessToken, refreshToken, and user with role', async () => {
    const email = `e2e-auth-login-${Date.now()}@musaium.test`;
    const password = 'Password123!';

    await registerUser(harness.request, { email, password });
    const res = await harness.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    expect(res.status).toBe(200);
    const body = res.body as {
      accessToken?: unknown;
      refreshToken?: unknown;
      user?: { email?: string; role?: string };
    };
    expect(typeof body.accessToken).toBe('string');
    expect(typeof body.refreshToken).toBe('string');
    expect(body.user?.email).toBe(email);
    expect(body.user?.role).toBe('visitor');
  });

  it('GET /api/auth/me returns profile with id, email, role', async () => {
    const { token, email } = await registerAndLogin(harness.request);

    const res = await harness.request('/api/auth/me', { method: 'GET' }, token);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        user: expect.objectContaining({
          id: expect.any(Number),
          email,
          role: 'visitor',
        }),
      }),
    );
  });

  it('PUT /api/auth/change-password succeeds and old password is rejected', async () => {
    const oldPassword = 'Password123!';
    const newPassword = 'NewPassword456!';
    const { token, email } = await registerAndLogin(harness.request, {
      password: oldPassword,
    });

    // Change password
    const changeRes = await harness.request(
      '/api/auth/change-password',
      {
        method: 'PUT',
        body: JSON.stringify({
          currentPassword: oldPassword,
          newPassword,
        }),
      },
      token,
    );
    expect(changeRes.status).toBe(200);

    // Login with new password succeeds
    const loginNew = await harness.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password: newPassword }),
    });
    expect(loginNew.status).toBe(200);

    // Login with old password fails
    const loginOld = await harness.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password: oldPassword }),
    });
    expect(loginOld.status).toBe(401);
  });

  it('POST /api/auth/forgot-password returns 200', async () => {
    const { email } = await registerAndLogin(harness.request);

    const res = await harness.request('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        message: expect.any(String),
      }),
    );
  });

  it('DELETE /api/auth/account returns { deleted: true } and login fails after', async () => {
    const password = 'Password123!';
    const { token, email } = await registerAndLogin(harness.request, { password });

    // Delete account
    const deleteRes = await harness.request('/api/auth/account', { method: 'DELETE' }, token);
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body).toEqual(expect.objectContaining({ deleted: true }));

    // Login after delete should fail
    const loginRes = await harness.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    expect(loginRes.status).toBe(401);
  });

  it('rejects /api/auth/me without a token', async () => {
    const res = await harness.request('/api/auth/me', { method: 'GET' });
    expect(res.status).toBe(401);
  });

  it('POST /api/auth/refresh returns a new access token', async () => {
    const { refreshToken } = await registerAndLogin(harness.request);

    const res = await harness.request('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    });

    expect(res.status).toBe(200);
    expect(typeof (res.body as { accessToken?: unknown }).accessToken).toBe('string');
  });
});
