/**
 * E2E regression — email-change token replay (audit P0 #2, F8 §B2).
 *
 * Verifies the TypeORM `.set()` silent-skip fix:
 * `consumeEmailChangeToken` now writes `() => 'NULL'` for pending_email,
 * email_change_token, and email_change_token_expiry — without the fix
 * those columns survived the consume and the token (or the dangling
 * `pending_email` ghost) could be exploited.
 */
import { clearRateLimitBuckets } from '@shared/middleware/rate-limit.middleware';

import { createE2EHarness, type E2EHarness } from 'tests/helpers/e2e/e2e-app-harness';
import { registerAndLogin } from 'tests/helpers/e2e/e2e-auth.helpers';

const shouldRunE2E = process.env.RUN_E2E === 'true';
const describeE2E = shouldRunE2E ? describe : describe.skip;

describeE2E('auth change-email e2e', () => {
  jest.setTimeout(180_000);

  let harness: E2EHarness;

  beforeAll(async () => {
    harness = await createE2EHarness();
  });

  beforeEach(() => {
    // changeEmailLimiter is per-user (fresh per test) but emailVerificationLimiter
    // is IP-keyed; clear in-memory buckets to keep tests order-independent.
    clearRateLimitBuckets();
  });

  afterAll(async () => {
    await harness?.stop();
  });

  async function setupUserAndRequestChange(
    currentEmail: string,
    newEmail: string,
  ): Promise<{ token: string }> {
    const { token: accessToken, password } = await registerAndLogin(harness, {
      email: currentEmail,
    });

    const change = await harness.request('/api/auth/change-email', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ newEmail, currentPassword: password }),
    });
    expect(change.status).toBe(200);
    const body = change.body as { debugToken?: string };
    expect(typeof body.debugToken).toBe('string');
    return { token: body.debugToken! };
  }

  async function fetchEmailChangeColumns(email: string): Promise<{
    email: string;
    pending_email: string | null;
    email_change_token: string | null;
    email_change_token_expiry: Date | null;
  }> {
    const rows = await harness.dataSource.query<
      {
        email: string;
        pending_email: string | null;
        email_change_token: string | null;
        email_change_token_expiry: Date | null;
      }[]
    >(
      'SELECT email, pending_email, email_change_token, email_change_token_expiry FROM users WHERE email = $1 OR pending_email = $1',
      [email],
    );
    return rows[0];
  }

  it('happy path: confirm → 200, email rotated, pending + token + expiry all NULL', async () => {
    const oldEmail = `e2e-change-old-${Date.now()}@musaium.test`;
    const newEmail = `e2e-change-new-${Date.now()}@musaium.test`;
    const { token } = await setupUserAndRequestChange(oldEmail, newEmail);

    // Sanity: pending_email + token populated before consume.
    const pre = await fetchEmailChangeColumns(oldEmail);
    expect(pre.email).toBe(oldEmail);
    expect(pre.pending_email).toBe(newEmail);
    expect(pre.email_change_token).not.toBeNull();
    expect(pre.email_change_token_expiry).not.toBeNull();

    const consume = await harness.request('/api/auth/confirm-email-change', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
    expect(consume.status).toBe(200);

    // The fix: email is rotated AND the three nullable columns are cleared.
    // Without `() => 'NULL'` the columns would remain populated, leaving a
    // ghost `pending_email` and a still-valid token usable for replay.
    const post = await fetchEmailChangeColumns(newEmail);
    expect(post.email).toBe(newEmail);
    expect(post.pending_email).toBeNull();
    expect(post.email_change_token).toBeNull();
    expect(post.email_change_token_expiry).toBeNull();
  });

  it('replay rejection: re-POST same token → 400', async () => {
    const oldEmail = `e2e-change-replay-old-${Date.now()}@musaium.test`;
    const newEmail = `e2e-change-replay-new-${Date.now()}@musaium.test`;
    const { token } = await setupUserAndRequestChange(oldEmail, newEmail);

    const first = await harness.request('/api/auth/confirm-email-change', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
    expect(first.status).toBe(200);

    const replay = await harness.request('/api/auth/confirm-email-change', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
    expect(replay.status).toBe(400);
  });

  it('tampered token → 400 + row state untouched', async () => {
    const oldEmail = `e2e-change-tampered-old-${Date.now()}@musaium.test`;
    const newEmail = `e2e-change-tampered-new-${Date.now()}@musaium.test`;
    const { token } = await setupUserAndRequestChange(oldEmail, newEmail);
    const tampered = `${token.slice(0, -3)}AAA`;

    const res = await harness.request('/api/auth/confirm-email-change', {
      method: 'POST',
      body: JSON.stringify({ token: tampered }),
    });
    expect(res.status).toBe(400);

    // Tampered token doesn't match → email-change row state is untouched.
    const state = await fetchEmailChangeColumns(oldEmail);
    expect(state.email).toBe(oldEmail);
    expect(state.pending_email).toBe(newEmail);
    expect(state.email_change_token).not.toBeNull();
  });
});
