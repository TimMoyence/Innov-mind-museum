/**
 * Spec C T2.4 — `PATCH /auth/tts-voice` route + `GET /auth/me` returns ttsVoice.
 *
 * Boots a real Postgres testcontainer via {@link createE2EHarness} and exercises
 * the full HTTP slice: register + login → PATCH the voice → GET /me echoes it.
 *
 * Gated on `RUN_E2E=true || RUN_INTEGRATION=true` per the existing convention
 * (matches sibling integration suites that boot a real Postgres testcontainer).
 *
 * Run with:
 *   RUN_E2E=true RUN_INTEGRATION=true pnpm test -- --testPathPattern=me-tts-voice
 */
import { createE2EHarness, type E2EHarness } from 'tests/helpers/e2e/e2e-app-harness';
import { registerAndLogin } from 'tests/helpers/e2e/e2e-auth.helpers';

const shouldRun = process.env.RUN_E2E === 'true' || process.env.RUN_INTEGRATION === 'true';
const describeE2E = shouldRun ? describe : describe.skip;

describeE2E('PATCH /auth/tts-voice (Spec C T2.4)', () => {
  jest.setTimeout(180_000);

  let harness: E2EHarness;

  beforeAll(async () => {
    harness = await createE2EHarness();
  });

  afterAll(async () => {
    await harness?.stop();
  });

  // Strong, non-breached password so the register useCase doesn't reject in HIBP check.
  const TEST_PASSWORD = 'Sp3cC-T2.4-Vc!QzPxLm';

  it('persists a known voice and returns it on subsequent GET /auth/me', async () => {
    const { token } = await registerAndLogin(harness, { password: TEST_PASSWORD });

    const resp = await harness.request(
      '/api/auth/tts-voice',
      { method: 'PATCH', body: JSON.stringify({ voice: 'echo' }) },
      token,
    );
    expect(resp.status).toBe(200);
    expect(resp.body).toEqual({ ttsVoice: 'echo' });

    const meResp = await harness.request('/api/auth/me', { method: 'GET' }, token);
    expect(meResp.status).toBe(200);
    const meBody = meResp.body as { user: { ttsVoice: string | null } };
    expect(meBody.user.ttsVoice).toBe('echo');
  });

  it('null resets to default', async () => {
    const { token } = await registerAndLogin(harness, { password: TEST_PASSWORD });

    await harness.request(
      '/api/auth/tts-voice',
      { method: 'PATCH', body: JSON.stringify({ voice: 'echo' }) },
      token,
    );
    const resp = await harness.request(
      '/api/auth/tts-voice',
      { method: 'PATCH', body: JSON.stringify({ voice: null }) },
      token,
    );
    expect(resp.status).toBe(200);
    expect(resp.body).toEqual({ ttsVoice: null });

    const meResp = await harness.request('/api/auth/me', { method: 'GET' }, token);
    const meBody = meResp.body as { user: { ttsVoice: string | null } };
    expect(meBody.user.ttsVoice).toBeNull();
  });

  it('rejects unknown voice with 400', async () => {
    const { token } = await registerAndLogin(harness, { password: TEST_PASSWORD });

    const resp = await harness.request(
      '/api/auth/tts-voice',
      { method: 'PATCH', body: JSON.stringify({ voice: 'sage' }) },
      token,
    );
    expect(resp.status).toBe(400);
  });

  it('requires auth', async () => {
    const resp = await harness.request('/api/auth/tts-voice', {
      method: 'PATCH',
      body: JSON.stringify({ voice: 'echo' }),
    });
    expect(resp.status).toBe(401);
  });
});
