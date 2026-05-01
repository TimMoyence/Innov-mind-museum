import { createE2EHarness, type E2EHarness } from 'tests/helpers/e2e/e2e-app-harness';
import { registerUser } from 'tests/helpers/e2e/e2e-auth.helpers';

const shouldRunE2E = process.env.RUN_E2E === 'true';
const describeE2E = shouldRunE2E ? describe : describe.skip;

const REFRESH_LIMIT_PER_MIN = 30;

describeE2E('auth /refresh rate-limit e2e (F1 contract)', () => {
  jest.setTimeout(180_000);

  let harness: E2EHarness;

  beforeAll(async () => {
    harness = await createE2EHarness();
  });

  afterAll(async () => {
    await harness?.stop();
  });

  async function loginAndGetTokens(): Promise<{ refreshToken: string; accessToken: string }> {
    const email = `e2e-refresh-rate-${Date.now()}-${Math.random().toString(36).slice(2)}@musaium.test`;
    const password = 'Password123!';
    await registerUser(harness, { email, password });
    const login = await harness.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    expect(login.status).toBe(200);
    const body = login.body as { accessToken: string; refreshToken: string };
    return { accessToken: body.accessToken, refreshToken: body.refreshToken };
  }

  it('30 sequential /refresh succeed; 31st returns 429', async () => {
    const { refreshToken: initial } = await loginAndGetTokens();
    let current = initial;

    for (let i = 0; i < REFRESH_LIMIT_PER_MIN; i += 1) {
      const r = await harness.request('/api/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refreshToken: current }),
      });
      expect(r.status).toBe(200);
      current = (r.body as { refreshToken: string }).refreshToken;
    }

    // The 31st should be rate-limited
    const overLimit = await harness.request('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: current }),
    });
    expect(overLimit.status).toBe(429);
  });

  it('rate-limit response carries Retry-After or rate-limit envelope', async () => {
    const { refreshToken: initial } = await loginAndGetTokens();
    let current = initial;

    for (let i = 0; i < REFRESH_LIMIT_PER_MIN; i += 1) {
      const r = await harness.request('/api/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refreshToken: current }),
      });
      expect(r.status).toBe(200);
      current = (r.body as { refreshToken: string }).refreshToken;
    }

    const overLimit = await harness.request('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: current }),
    });
    expect(overLimit.status).toBe(429);
    const bodyMentionsRateLimit = /rate.?limit|too.?many/i.exec(JSON.stringify(overLimit.body));
    expect(bodyMentionsRateLimit).toBeTruthy();
  });

  it('limit is keyed per-family: a fresh login from a different user is unaffected', async () => {
    const userA = await loginAndGetTokens();
    let aRefresh = userA.refreshToken;

    // Burn user A's quota
    for (let i = 0; i < REFRESH_LIMIT_PER_MIN; i += 1) {
      const r = await harness.request('/api/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refreshToken: aRefresh }),
      });
      expect(r.status).toBe(200);
      aRefresh = (r.body as { refreshToken: string }).refreshToken;
    }
    const aOver = await harness.request('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: aRefresh }),
    });
    expect(aOver.status).toBe(429);

    // User B has its own family; should not be limited
    const userB = await loginAndGetTokens();
    const bRefresh = await harness.request('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: userB.refreshToken }),
    });
    expect(bRefresh.status).toBe(200);
  });

  it('429 response body does not leak the refresh token back', async () => {
    const { refreshToken: initial } = await loginAndGetTokens();
    let current = initial;
    for (let i = 0; i < REFRESH_LIMIT_PER_MIN; i += 1) {
      const r = await harness.request('/api/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refreshToken: current }),
      });
      expect(r.status).toBe(200);
      current = (r.body as { refreshToken: string }).refreshToken;
    }
    const blocked = await harness.request('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: current }),
    });
    expect(blocked.status).toBe(429);
    expect(JSON.stringify(blocked.body)).not.toContain(current);
  });
});
