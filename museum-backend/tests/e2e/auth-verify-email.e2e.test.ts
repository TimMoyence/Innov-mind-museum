import { createE2EHarness, type E2EHarness } from 'tests/helpers/e2e/e2e-app-harness';

const shouldRunE2E = process.env.RUN_E2E === 'true';
const describeE2E = shouldRunE2E ? describe : describe.skip;

describeE2E('auth verify-email e2e', () => {
  jest.setTimeout(180_000);

  let harness: E2EHarness;

  beforeAll(async () => {
    harness = await createE2EHarness();
    expect(harness.testEmailService).not.toBeNull();
  });

  afterAll(async () => {
    await harness?.stop();
  });

  beforeEach(() => {
    harness.testEmailService?.reset();
  });

  async function registerAndCaptureToken(email: string): Promise<string> {
    const reg = await harness.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password: 'Password123!',
        firstname: 'Verify',
        lastname: 'Test',
        gdprConsent: true,
      }),
    });
    expect(reg.status).toBe(201);
    const token = harness.testEmailService?.findVerificationTokenFor(email) ?? null;
    expect(token).toMatch(/^[A-Za-z0-9_\-]{16,}$/);
    return token!;
  }

  async function fetchEmailVerified(email: string): Promise<boolean> {
    const result = await harness.dataSource.query<{ email_verified: boolean }[]>(
      'SELECT email_verified FROM users WHERE email = $1',
      [email],
    );
    return result[0]?.email_verified;
  }

  it('happy path: register sends an email with a verification token', async () => {
    const email = `e2e-verify-happy-${Date.now()}@musaium.test`;
    const token = await registerAndCaptureToken(email);
    expect(token.length).toBeGreaterThanOrEqual(16);
    expect(await fetchEmailVerified(email)).toBe(false);
  });

  it('POST /api/auth/verify-email consumes the token and sets email_verified=true', async () => {
    const email = `e2e-verify-consume-${Date.now()}@musaium.test`;
    const token = await registerAndCaptureToken(email);

    const res = await harness.request('/api/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ verified: true });
    expect(await fetchEmailVerified(email)).toBe(true);
  });

  it('replaying the same token returns 400', async () => {
    const email = `e2e-verify-replay-${Date.now()}@musaium.test`;
    const token = await registerAndCaptureToken(email);
    const first = await harness.request('/api/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
    expect(first.status).toBe(200);

    const replay = await harness.request('/api/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
    expect(replay.status).toBe(400);
  });

  it('tampered token returns 400', async () => {
    const email = `e2e-verify-tampered-${Date.now()}@musaium.test`;
    const token = await registerAndCaptureToken(email);
    const tampered = `${token.slice(0, -3)}AAA`;

    const res = await harness.request('/api/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token: tampered }),
    });
    expect(res.status).toBe(400);
    expect(await fetchEmailVerified(email)).toBe(false);
  });

  it('whitespace-padded token is accepted (verifyEmailUseCase trims)', async () => {
    const email = `e2e-verify-trim-${Date.now()}@musaium.test`;
    const token = await registerAndCaptureToken(email);

    const res = await harness.request('/api/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token: `  ${token}  ` }),
    });
    expect(res.status).toBe(200);
    expect(await fetchEmailVerified(email)).toBe(true);
  });

  it('empty token returns 400', async () => {
    const res = await harness.request('/api/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token: '' }),
    });
    expect([400, 422]).toContain(res.status);
  });

  it('unknown user token returns 400 (not 404 — avoid enumeration)', async () => {
    const res = await harness.request('/api/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token: 'totally-fake-token-that-does-not-exist-anywhere' }),
    });
    expect(res.status).toBe(400);
  });
});
