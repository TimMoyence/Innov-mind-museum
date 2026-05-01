import { createHash } from 'node:crypto';

import { createE2EHarness, type E2EHarness } from 'tests/helpers/e2e/e2e-app-harness';
import { startSocialJwtSpoof, type SocialJwtSpoof } from 'tests/helpers/auth/social-jwt-spoof';

const shouldRunE2E = process.env.RUN_E2E === 'true';
const describeE2E = shouldRunE2E ? describe : describe.skip;

describeE2E('auth social-login e2e (Apple + Google + F3 nonce)', () => {
  jest.setTimeout(180_000);

  let harness: E2EHarness;
  let spoof: SocialJwtSpoof;

  beforeAll(async () => {
    spoof = await startSocialJwtSpoof();
    process.env.APPLE_OIDC_JWKS_URL = spoof.jwksUrl;
    process.env.GOOGLE_OIDC_JWKS_URL = spoof.jwksUrl;
    process.env.OIDC_NONCE_ENFORCE = 'true';
    harness = await createE2EHarness();
  });

  afterAll(async () => {
    await harness?.stop();
    await spoof?.stop();
  });

  async function fetchNonce(): Promise<string> {
    const res = await harness.request('/api/auth/social-nonce', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const nonce = (res.body as { nonce: string }).nonce;
    expect(nonce.length).toBeGreaterThan(0);
    return nonce;
  }

  function googleClaims(opts: {
    sub?: string;
    email?: string;
    aud?: string;
    nonce?: string;
    expSec?: number;
  }): Record<string, unknown> {
    const now = Math.floor(Date.now() / 1000);
    return {
      iss: 'https://accounts.google.com',
      sub: opts.sub ?? `google-test-sub-${Date.now()}`,
      aud: opts.aud ?? process.env.GOOGLE_OAUTH_CLIENT_ID,
      email: opts.email ?? `e2e-google-${Date.now()}@example.com`,
      email_verified: true,
      iat: now - 5,
      exp: opts.expSec ?? now + 600,
      nonce: opts.nonce,
    };
  }

  function appleClaims(opts: {
    sub?: string;
    email?: string;
    nonce?: string;
  }): Record<string, unknown> {
    const now = Math.floor(Date.now() / 1000);
    const hashedNonce = opts.nonce
      ? createHash('sha256').update(opts.nonce).digest('hex')
      : undefined;
    return {
      iss: 'https://appleid.apple.com',
      sub: opts.sub ?? `apple-test-sub-${Date.now()}`,
      aud: process.env.APPLE_CLIENT_ID,
      email: opts.email ?? `e2e-apple-${Date.now()}@example.com`,
      email_verified: 'true',
      iat: now - 5,
      exp: now + 600,
      nonce: hashedNonce,
    };
  }

  it('Google: valid ID token + nonce → 200 + tokens', async () => {
    const nonce = await fetchNonce();
    const idToken = spoof.signToken(googleClaims({ nonce }));
    const res = await harness.request('/api/auth/social-login', {
      method: 'POST',
      body: JSON.stringify({ provider: 'google', idToken, nonce }),
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
        user: expect.objectContaining({ email: expect.any(String) }),
      }),
    );
  });

  it('Apple: valid ID token + sha256(nonce) → 200', async () => {
    const nonce = await fetchNonce();
    const idToken = spoof.signToken(appleClaims({ nonce }));
    const res = await harness.request('/api/auth/social-login', {
      method: 'POST',
      body: JSON.stringify({ provider: 'apple', idToken, nonce }),
    });
    expect(res.status).toBe(200);
  });

  it('F3 replay: same nonce twice → 401 INVALID_NONCE', async () => {
    const nonce = await fetchNonce();
    const idToken = spoof.signToken(googleClaims({ nonce }));

    const first = await harness.request('/api/auth/social-login', {
      method: 'POST',
      body: JSON.stringify({ provider: 'google', idToken, nonce }),
    });
    expect(first.status).toBe(200);

    const replay = await harness.request('/api/auth/social-login', {
      method: 'POST',
      body: JSON.stringify({ provider: 'google', idToken, nonce }),
    });
    expect(replay.status).toBe(401);
  });

  it('wrong audience → 401', async () => {
    const nonce = await fetchNonce();
    const idToken = spoof.signToken(googleClaims({ nonce, aud: 'wrong-audience.example.com' }));
    const res = await harness.request('/api/auth/social-login', {
      method: 'POST',
      body: JSON.stringify({ provider: 'google', idToken, nonce }),
    });
    expect(res.status).toBe(401);
  });

  it('expired token → 401', async () => {
    const nonce = await fetchNonce();
    const past = Math.floor(Date.now() / 1000) - 600;
    const idToken = spoof.signToken(googleClaims({ nonce, expSec: past }));
    const res = await harness.request('/api/auth/social-login', {
      method: 'POST',
      body: JSON.stringify({ provider: 'google', idToken, nonce }),
    });
    expect(res.status).toBe(401);
  });

  it('Apple: nonce mismatch (claim != sha256(rawNonce)) → 401', async () => {
    const nonce = await fetchNonce();
    const idToken = spoof.signToken(
      appleClaims({ nonce: 'other-nonce-not-the-server-issued-one' }),
    );
    const res = await harness.request('/api/auth/social-login', {
      method: 'POST',
      body: JSON.stringify({ provider: 'apple', idToken, nonce }),
    });
    expect(res.status).toBe(401);
  });

  it('Google: missing nonce claim with OIDC_NONCE_ENFORCE=true → 401', async () => {
    const nonce = await fetchNonce();
    const claims = googleClaims({ nonce });
    delete claims.nonce;
    const idToken = spoof.signToken(claims);
    const res = await harness.request('/api/auth/social-login', {
      method: 'POST',
      body: JSON.stringify({ provider: 'google', idToken, nonce }),
    });
    expect(res.status).toBe(401);
  });

  it('mobile audience accepted (reproduces f7437490 contract)', async () => {
    const nonce = await fetchNonce();
    const idToken = spoof.signToken(
      googleClaims({ nonce, aud: process.env.GOOGLE_OAUTH_CLIENT_ID }),
    );
    const res = await harness.request('/api/auth/social-login', {
      method: 'POST',
      body: JSON.stringify({ provider: 'google', idToken, nonce }),
    });
    expect(res.status).toBe(200);
  });

  it('repeat sub is treated as same user (no duplicate user row)', async () => {
    const nonce1 = await fetchNonce();
    const sub = `google-test-stable-sub-${Date.now()}`;
    const idToken1 = spoof.signToken(googleClaims({ sub, nonce: nonce1 }));
    const r1 = await harness.request('/api/auth/social-login', {
      method: 'POST',
      body: JSON.stringify({ provider: 'google', idToken: idToken1, nonce: nonce1 }),
    });
    expect(r1.status).toBe(200);
    const userId1 = (r1.body as { user: { id: number } }).user.id;

    const nonce2 = await fetchNonce();
    const idToken2 = spoof.signToken(googleClaims({ sub, nonce: nonce2 }));
    const r2 = await harness.request('/api/auth/social-login', {
      method: 'POST',
      body: JSON.stringify({ provider: 'google', idToken: idToken2, nonce: nonce2 }),
    });
    expect(r2.status).toBe(200);
    expect((r2.body as { user: { id: number } }).user.id).toBe(userId1);
  });
});
