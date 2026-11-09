import { clearRateLimitBuckets } from '@shared/middleware/rate-limit.middleware';

import { createE2EHarness, type E2EHarness } from 'tests/helpers/e2e/e2e-app-harness';
import { registerUser } from 'tests/helpers/e2e/e2e-auth.helpers';

const shouldRunE2E = process.env.RUN_E2E === 'true';
const describeE2E = shouldRunE2E ? describe : describe.skip;

describeE2E('auth password-reset e2e', () => {
  let harness: E2EHarness;

  beforeAll(async () => {
    harness = await createE2EHarness();
  });

  beforeEach(() => {
    clearRateLimitBuckets();
  });

  afterAll(async () => {
    await harness?.stop();
  });

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
    await registerUser(harness, { email });
    const token = await requestResetToken(email);

    const pre = await fetchResetTokenColumns(email);
    expect(pre.reset_token).not.toBeNull();
    expect(pre.reset_token_expires).not.toBeNull();

    const consume = await harness.request('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword: 'NewPassword123!' }),
    });
    expect(consume.status).toBe(200);

    const post = await fetchResetTokenColumns(email);
    expect(post.reset_token).toBeNull();
    expect(post.reset_token_expires).toBeNull();
  });

  it('replay rejection: re-POST same token → 400', async () => {
    const email = `e2e-reset-replay-${Date.now()}@musaium.test`;
    await registerUser(harness, { email });
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
    await registerUser(harness, { email });
    const token = await requestResetToken(email);
    const tampered = `${token.slice(0, -3)}AAA`;

    const res = await harness.request('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token: tampered, newPassword: 'NopeNew123!' }),
    });
    expect(res.status).toBe(400);

    const state = await fetchResetTokenColumns(email);
    expect(state.reset_token).not.toBeNull();
  });
});
