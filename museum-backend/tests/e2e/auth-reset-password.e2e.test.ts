/**
 * E2E regression — password-reset token replay (audit P0 #2, F8 §B1).
 *
 * Verifies the TypeORM `.set()` silent-skip fix:
 * `consumeResetTokenAndUpdatePassword` now writes `() => 'NULL'` instead of
 * `undefined`, so the reset_token and reset_token_expires columns are actually
 * cleared on consume. Without the fix, the token could be replayed for the
 * full TTL after a successful reset.
 */
import { createE2EHarness, type E2EHarness } from 'tests/helpers/e2e/e2e-app-harness';

const shouldRunE2E = process.env.RUN_E2E === 'true';
const describeE2E = shouldRunE2E ? describe : describe.skip;

describeE2E('auth password-reset e2e', () => {
  jest.setTimeout(180_000);

  let harness: E2EHarness;

  beforeAll(async () => {
    harness = await createE2EHarness();
  });

  afterAll(async () => {
    await harness?.stop();
  });

  async function registerUser(email: string): Promise<void> {
    const reg = await harness.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password: 'OldPassword123!',
        firstname: 'Reset',
        lastname: 'Test',
        gdprConsent: true,
      }),
    });
    expect(reg.status).toBe(201);
  }

  async function requestResetToken(email: string): Promise<string> {
    const res = await harness.request('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
    expect(res.status).toBe(200);
    const body = res.body as { debugResetToken?: string };
    expect(typeof body.debugResetToken).toBe('string');
    return body.debugResetToken!;
  }

  async function fetchResetTokenColumns(
    email: string,
  ): Promise<{ reset_token: string | null; reset_token_expires: Date | null }> {
    const rows = await harness.dataSource.query<
      { reset_token: string | null; reset_token_expires: Date | null }[]
    >('SELECT reset_token, reset_token_expires FROM users WHERE email = $1', [email]);
    return rows[0];
  }

  it('happy path: consume token → 200, password updated, reset_token cleared to NULL', async () => {
    const email = `e2e-reset-happy-${Date.now()}@musaium.test`;
    await registerUser(email);
    const token = await requestResetToken(email);

    // Sanity: reset_token IS populated pre-consume.
    const pre = await fetchResetTokenColumns(email);
    expect(pre.reset_token).not.toBeNull();
    expect(pre.reset_token_expires).not.toBeNull();

    const consume = await harness.request('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword: 'NewPassword123!' }),
    });
    expect(consume.status).toBe(200);

    // The fix: columns must be NULL after consume. Without `() => 'NULL'` the
    // TypeORM `.set({ field: undefined })` is silently skipped and these rows
    // would still be populated — allowing replay.
    const post = await fetchResetTokenColumns(email);
    expect(post.reset_token).toBeNull();
    expect(post.reset_token_expires).toBeNull();
  });

  it('replay rejection: re-POST same token → 400', async () => {
    const email = `e2e-reset-replay-${Date.now()}@musaium.test`;
    await registerUser(email);
    const token = await requestResetToken(email);

    const first = await harness.request('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword: 'FirstNew123!' }),
    });
    expect(first.status).toBe(200);

    const replay = await harness.request('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword: 'SecondNew123!' }),
    });
    expect(replay.status).toBe(400);
  });

  it('tampered token → 400 + row state untouched', async () => {
    const email = `e2e-reset-tampered-${Date.now()}@musaium.test`;
    await registerUser(email);
    const token = await requestResetToken(email);
    const tampered = `${token.slice(0, -3)}AAA`;

    const res = await harness.request('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token: tampered, newPassword: 'NopeNew123!' }),
    });
    expect(res.status).toBe(400);

    // Tampered token doesn't match → reset_token row remains populated.
    const state = await fetchResetTokenColumns(email);
    expect(state.reset_token).not.toBeNull();
  });
});
