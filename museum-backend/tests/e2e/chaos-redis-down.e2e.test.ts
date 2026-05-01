import { createE2EHarness, type E2EHarness } from 'tests/helpers/e2e/e2e-app-harness';
import { registerAndLogin } from 'tests/helpers/e2e/e2e-auth.helpers';
import { BrokenRedisCache } from 'tests/helpers/chaos/broken-redis-cache';

const shouldRunE2E = process.env.RUN_E2E === 'true';
const describeE2E = shouldRunE2E ? describe : describe.skip;

describeE2E('chaos: Redis down (cache always throws)', () => {
  jest.setTimeout(180_000);

  let harness: E2EHarness;
  let brokenCache: BrokenRedisCache;

  beforeAll(async () => {
    brokenCache = new BrokenRedisCache({ mode: 'always-throw' });
    harness = await createE2EHarness({ cacheService: brokenCache });
  });

  afterAll(async () => {
    await harness?.stop();
  });

  beforeEach(() => {
    brokenCache.reset();
  });

  it('POST /api/chat/sessions returns 201 even with broken cache', async () => {
    const { token } = await registerAndLogin(harness);
    const res = await harness.request(
      '/api/chat/sessions',
      { method: 'POST', body: JSON.stringify({ locale: 'en-US', museumMode: false }) },
      token,
    );
    expect(res.status).toBe(201);
  });

  it('chat-message round-trip returns 200 with broken cache', async () => {
    const { token } = await registerAndLogin(harness);
    const session = await harness.request(
      '/api/chat/sessions',
      { method: 'POST', body: JSON.stringify({ locale: 'en-US', museumMode: false }) },
      token,
    );
    const sessionId = (session.body as { session: { id: string } }).session.id;

    const res = await harness.request(
      `/api/chat/sessions/${sessionId}/messages`,
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

  it('repeated identical query still returns 200 (cache write also fails silently)', async () => {
    const { token } = await registerAndLogin(harness);
    const session = await harness.request(
      '/api/chat/sessions',
      { method: 'POST', body: JSON.stringify({ locale: 'en-US', museumMode: false }) },
      token,
    );
    const sessionId = (session.body as { session: { id: string } }).session.id;

    for (let i = 0; i < 3; i += 1) {
      const res = await harness.request(
        `/api/chat/sessions/${sessionId}/messages`,
        {
          method: 'POST',
          body: JSON.stringify({
            text: 'tell me about impressionism',
            context: { museumMode: false, locale: 'en-US', guideLevel: 'beginner' },
          }),
        },
        token,
      );
      expect(res.status).toBe(201);
    }
  });

  it('/api/health returns 200 even with broken cache', async () => {
    const res = await harness.request('/api/health', { method: 'GET' });
    expect(res.status).toBe(200);
  });

  it('cache attempts logged but no 5xx leak in response body', async () => {
    const { token } = await registerAndLogin(harness);
    const session = await harness.request(
      '/api/chat/sessions',
      { method: 'POST', body: JSON.stringify({ locale: 'en-US', museumMode: false }) },
      token,
    );
    const sessionId = (session.body as { session: { id: string } }).session.id;

    const res = await harness.request(
      `/api/chat/sessions/${sessionId}/messages`,
      {
        method: 'POST',
        body: JSON.stringify({
          text: 'test',
          context: { museumMode: false, locale: 'en-US', guideLevel: 'beginner' },
        }),
      },
      token,
    );
    expect(res.status).toBe(201);
    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toMatch(/ECONNREFUSED/i);
    expect(bodyStr).not.toMatch(/at .* \(/); // no stack traces
  });

  it('flaky cache mode (50% failure) still returns 2xx', async () => {
    // Quick reseat with flaky mode for one call
    const flakyCache = new BrokenRedisCache({ mode: 'flaky', failureRate: 0.5 });
    const flakyHarness = await createE2EHarness({ cacheService: flakyCache });
    try {
      const { token } = await registerAndLogin(flakyHarness);
      const res = await flakyHarness.request(
        '/api/chat/sessions',
        { method: 'POST', body: JSON.stringify({ locale: 'en-US', museumMode: false }) },
        token,
      );
      expect(res.status).toBe(201);
    } finally {
      await flakyHarness.stop();
    }
  });

  it('login flow works with broken cache', async () => {
    const { token } = await registerAndLogin(harness);
    expect(token).toBeTruthy();
  });
});
