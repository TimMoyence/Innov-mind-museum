import { createE2EHarness, type E2EHarness } from 'tests/helpers/e2e/e2e-app-harness';
import { registerAndLogin } from 'tests/helpers/e2e/e2e-auth.helpers';

const shouldRun = process.env.RUN_E2E === 'true' || process.env.RUN_INTEGRATION === 'true';
const describeE2E = shouldRun ? describe : describe.skip;

interface MePayload {
  user: {
    defaultMuseumMode: boolean;
    guideLevel: string;
    dataMode: string;
    audioDescriptionMode: boolean;
  };
}

describeE2E('PATCH /auth/me/preferences (TD-2)', () => {
  let harness: E2EHarness;

  beforeAll(async () => {
    harness = await createE2EHarness();
  });

  afterAll(async () => {
    await harness?.stop();
  });

  const TEST_PASSWORD = 'TD2-Pp.Pref-9!QzPxLm';

  it('GET /auth/me returns server defaults for a freshly registered user', async () => {
    const { token } = await registerAndLogin(harness, { password: TEST_PASSWORD });

    const meResp = await harness.request('/api/auth/me', { method: 'GET' }, token);
    expect(meResp.status).toBe(200);
    const meBody = meResp.body as MePayload;
    expect(meBody.user).toMatchObject({
      defaultMuseumMode: true,
      guideLevel: 'beginner',
      dataMode: 'auto',
      audioDescriptionMode: false,
    });
  });

  it('persists a partial patch and echoes the canonical state', async () => {
    const { token } = await registerAndLogin(harness, { password: TEST_PASSWORD });

    const patchResp = await harness.request(
      '/api/auth/me/preferences',
      { method: 'PATCH', body: JSON.stringify({ guideLevel: 'expert' }) },
      token,
    );
    expect(patchResp.status).toBe(200);
    expect(patchResp.body).toMatchObject({
      guideLevel: 'expert',
      defaultMuseumMode: true,
      dataMode: 'auto',
      audioDescriptionMode: false,
    });

    const meResp = await harness.request('/api/auth/me', { method: 'GET' }, token);
    expect(meResp.status).toBe(200);
    const meBody = meResp.body as MePayload;
    expect(meBody.user).toMatchObject({
      guideLevel: 'expert',
      defaultMuseumMode: true,
      dataMode: 'auto',
      audioDescriptionMode: false,
    });
  });

  it('persists a full patch with all 5 fields', async () => {
    const { token } = await registerAndLogin(harness, { password: TEST_PASSWORD });

    const patchResp = await harness.request(
      '/api/auth/me/preferences',
      {
        method: 'PATCH',
        body: JSON.stringify({
          defaultMuseumMode: false,
          guideLevel: 'intermediate',
          dataMode: 'low',
          audioDescriptionMode: true,
        }),
      },
      token,
    );
    expect(patchResp.status).toBe(200);

    const meResp = await harness.request('/api/auth/me', { method: 'GET' }, token);
    const meBody = meResp.body as MePayload;
    expect(meBody.user).toMatchObject({
      defaultMuseumMode: false,
      guideLevel: 'intermediate',
      dataMode: 'low',
      audioDescriptionMode: true,
    });
  });

  it('rejects an invalid enum value with 400', async () => {
    const { token } = await registerAndLogin(harness, { password: TEST_PASSWORD });

    const resp = await harness.request(
      '/api/auth/me/preferences',
      { method: 'PATCH', body: JSON.stringify({ guideLevel: 'master' }) },
      token,
    );
    expect(resp.status).toBe(400);
  });

  it('rejects an empty body with 400 (Zod .refine non-empty)', async () => {
    const { token } = await registerAndLogin(harness, { password: TEST_PASSWORD });

    const resp = await harness.request(
      '/api/auth/me/preferences',
      { method: 'PATCH', body: JSON.stringify({}) },
      token,
    );
    expect(resp.status).toBe(400);
  });

  it('requires auth (401 without bearer token)', async () => {
    const resp = await harness.request('/api/auth/me/preferences', {
      method: 'PATCH',
      body: JSON.stringify({ guideLevel: 'expert' }),
    });
    expect(resp.status).toBe(401);
  });
});
