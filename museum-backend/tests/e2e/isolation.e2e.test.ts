import { createE2EHarness, E2EHarness } from 'tests/helpers/e2e/e2e-app-harness';
import { registerAndLogin } from 'tests/helpers/e2e/e2e-auth.helpers';

const shouldRunE2E = process.env.RUN_E2E === 'true';
const describeE2E = shouldRunE2E ? describe : describe.skip;

describeE2E('multi-tenancy isolation e2e', () => {
  let harness: E2EHarness;

  beforeAll(async () => {
    harness = await createE2EHarness();
  });

  afterAll(async () => {
    await harness?.stop();
  });

  it('prevents User B from accessing User A resources', async () => {
    const userA = await registerAndLogin(harness);
    const userB = await registerAndLogin(harness);

    const createRes = await harness.request(
      '/api/chat/sessions',
      {
        method: 'POST',
        body: JSON.stringify({ locale: 'en', museumMode: true }),
      },
      userA.token,
    );
    expect(createRes.status).toBe(201);
    const sessionA = (createRes.body as { session: { id: string } }).session;

    const postRes = await harness.request(
      `/api/chat/sessions/${sessionA.id}/messages`,
      {
        method: 'POST',
        body: JSON.stringify({
          text: 'Tell me about impressionism',
          context: { museumMode: true, locale: 'en', guideLevel: 'beginner' },
        }),
      },
      userA.token,
    );
    expect(postRes.status).toBe(201);

    const getRes = await harness.request(
      `/api/chat/sessions/${sessionA.id}?limit=20`,
      { method: 'GET' },
      userB.token,
    );
    expect(getRes.status).toBe(404);

    const postCrossRes = await harness.request(
      `/api/chat/sessions/${sessionA.id}/messages`,
      {
        method: 'POST',
        body: JSON.stringify({
          text: 'Injected message from User B',
          context: { museumMode: true, locale: 'en', guideLevel: 'beginner' },
        }),
      },
      userB.token,
    );
    expect(postCrossRes.status).toBe(404);

    const listRes = await harness.request(
      '/api/chat/sessions?limit=20',
      { method: 'GET' },
      userB.token,
    );
    expect(listRes.status).toBe(200);
    const listBody = listRes.body as { sessions: Array<{ id: string }> };
    expect(listBody.sessions).toHaveLength(0);

    const deleteRes = await harness.request(
      `/api/chat/sessions/${sessionA.id}`,
      { method: 'DELETE' },
      userB.token,
    );
    expect(deleteRes.status).toBe(404);

    const getOwnRes = await harness.request(
      `/api/chat/sessions/${sessionA.id}?limit=20`,
      { method: 'GET' },
      userA.token,
    );
    expect(getOwnRes.status).toBe(200);
  });
});
