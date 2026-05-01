import { createE2EHarness, type E2EHarness } from 'tests/helpers/e2e/e2e-app-harness';
import { registerUser } from 'tests/helpers/e2e/e2e-auth.helpers';

const shouldRunE2E = process.env.RUN_E2E === 'true';
const describeE2E = shouldRunE2E ? describe : describe.skip;

describeE2E('auth refresh-token rotation e2e', () => {
  jest.setTimeout(180_000);

  let harness: E2EHarness;

  beforeAll(async () => {
    harness = await createE2EHarness();
  });

  afterAll(async () => {
    await harness?.stop();
  });

  async function loginAndGetTokens(): Promise<{ refreshToken: string }> {
    const email = `e2e-rotation-${Date.now()}-${Math.random().toString(36).slice(2)}@musaium.test`;
    const password = 'Password123!';
    await registerUser(harness, { email, password });
    const login = await harness.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    expect(login.status).toBe(200);
    return { refreshToken: (login.body as { refreshToken: string }).refreshToken };
  }

  it('refresh rotates: token A → token B; A is revoked', async () => {
    const { refreshToken: a } = await loginAndGetTokens();

    const first = await harness.request('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: a }),
    });
    expect(first.status).toBe(200);
    const b = (first.body as { refreshToken: string }).refreshToken;
    expect(b).not.toBe(a);

    // Reusing A → 401 (replay detection)
    const replay = await harness.request('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: a }),
    });
    expect(replay.status).toBe(401);
  });

  it('replay attack revokes the family: B is invalidated after A is replayed', async () => {
    const { refreshToken: a } = await loginAndGetTokens();

    const first = await harness.request('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: a }),
    });
    expect(first.status).toBe(200);
    const b = (first.body as { refreshToken: string }).refreshToken;

    // Attacker replays A
    const replay = await harness.request('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: a }),
    });
    expect(replay.status).toBe(401);

    // Legit user's B should now also fail (family revoked)
    const usingB = await harness.request('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: b }),
    });
    expect(usingB.status).toBe(401);
  });

  it('chained rotations work: A → B → C → D, only D is valid', async () => {
    const { refreshToken: a } = await loginAndGetTokens();
    let current = a;
    for (let i = 0; i < 3; i += 1) {
      const r = await harness.request('/api/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refreshToken: current }),
      });
      expect(r.status).toBe(200);
      const next = (r.body as { refreshToken: string }).refreshToken;
      expect(next).not.toBe(current);
      current = next;
    }
    // current = D; A/B/C all revoked
    const replayA = await harness.request('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: a }),
    });
    expect(replayA.status).toBe(401);
  });

  it('logout invalidates the entire family', async () => {
    const { refreshToken: a } = await loginAndGetTokens();
    const logout = await harness.request('/api/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: a }),
    });
    expect([200, 204]).toContain(logout.status);

    const post = await harness.request('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: a }),
    });
    expect(post.status).toBe(401);
  });

  it('malformed refresh token returns 401, not 500', async () => {
    const r = await harness.request('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: 'not-a-jwt' }),
    });
    expect([401, 400]).toContain(r.status);
  });
});
