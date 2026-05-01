import { createE2EHarness, type E2EHarness } from 'tests/helpers/e2e/e2e-app-harness';
import { registerAndLogin } from 'tests/helpers/e2e/e2e-auth.helpers';

const shouldRunE2E = process.env.RUN_E2E === 'true';
const describeE2E = shouldRunE2E ? describe : describe.skip;

describeE2E('chaos: BullMQ knowledge-extraction worker offline', () => {
  jest.setTimeout(180_000);

  let harness: E2EHarness;

  beforeAll(async () => {
    harness = await createE2EHarness({ startKnowledgeExtractionWorker: false });
  });

  afterAll(async () => {
    await harness?.stop();
  });

  it('POST /api/chat/sessions returns 201 with worker offline', async () => {
    const { token } = await registerAndLogin(harness);
    const res = await harness.request(
      '/api/chat/sessions',
      { method: 'POST', body: JSON.stringify({ locale: 'en-US', museumMode: false }) },
      token,
    );
    expect(res.status).toBe(201);
  });

  it('chat-message round-trip returns 201 with worker offline', async () => {
    const { token } = await registerAndLogin(harness);
    const sessionRes = await harness.request(
      '/api/chat/sessions',
      { method: 'POST', body: JSON.stringify({ locale: 'en-US', museumMode: false }) },
      token,
    );
    const sid = (sessionRes.body as { session: { id: string } }).session.id;

    const res = await harness.request(
      `/api/chat/sessions/${sid}/messages`,
      {
        method: 'POST',
        body: JSON.stringify({
          text: 'hello',
          context: { museumMode: false, locale: 'en-US', guideLevel: 'beginner' },
        }),
      },
      token,
    );
    expect(res.status).toBe(201);
    expect((res.body as { message: { role: string } }).message.role).toBe('assistant');
  });

  it('/api/health returns 200 with worker offline', async () => {
    const res = await harness.request('/api/health', { method: 'GET' });
    expect(res.status).toBe(200);
  });

  it('login + register flow works with worker offline', async () => {
    const { token, refreshToken } = await registerAndLogin(harness);
    expect(token).toBeTruthy();
    expect(refreshToken).toBeTruthy();
  });

  it('multiple concurrent chat messages succeed with worker offline', async () => {
    const { token } = await registerAndLogin(harness);
    const sessionRes = await harness.request(
      '/api/chat/sessions',
      { method: 'POST', body: JSON.stringify({ locale: 'en-US', museumMode: false }) },
      token,
    );
    const sid = (sessionRes.body as { session: { id: string } }).session.id;

    const responses = await Promise.all(
      Array.from({ length: 3 }, (_, i) =>
        harness.request(
          `/api/chat/sessions/${sid}/messages`,
          {
            method: 'POST',
            body: JSON.stringify({
              text: `concurrent ${i}`,
              context: { museumMode: false, locale: 'en-US', guideLevel: 'beginner' },
            }),
          },
          token,
        ),
      ),
    );
    for (const r of responses) {
      expect(r.status).toBe(201);
    }
  });

  it('response body does not leak BullMQ / queue / worker error details', async () => {
    const { token } = await registerAndLogin(harness);
    const sessionRes = await harness.request(
      '/api/chat/sessions',
      { method: 'POST', body: JSON.stringify({ locale: 'en-US', museumMode: false }) },
      token,
    );
    const sid = (sessionRes.body as { session: { id: string } }).session.id;

    const res = await harness.request(
      `/api/chat/sessions/${sid}/messages`,
      {
        method: 'POST',
        body: JSON.stringify({
          text: 'no leak',
          context: { museumMode: false, locale: 'en-US', guideLevel: 'beginner' },
        }),
      },
      token,
    );
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/bullmq/i);
    expect(body).not.toMatch(/queue is paused/i);
    expect(body).not.toMatch(/worker.*offline/i);
  });
});
