/**
 * F3 — verifier-level nonce binding.
 *
 * Asserts the four cells of the nonce-enforcement matrix:
 *   provider × (expectedNonce present | absent) × (env.auth.oidcNonceEnforce true | false)
 *
 * Also asserts the Apple SHA-256 transform: Apple Sign-In hashes the nonce
 * client-side before embedding it in the ID token, so the backend MUST compare
 * `decoded.nonce` against `sha256(expectedNonce)` lowercase hex — NOT the raw
 * nonce. Google passes the nonce verbatim.
 */
import crypto from 'node:crypto';

import jwt from 'jsonwebtoken';

let oidcNonceEnforce = false;

jest.mock('@src/config/env', () => ({
  env: {
    auth: {
      appleClientId: 'com.example.app',
      googleClientIds: ['google-client-id-1'],
      get oidcNonceEnforce(): boolean {
        return oidcNonceEnforce;
      },
    },
  },
}));

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
const publicKeyObject = crypto.createPublicKey(publicKey);
const jwkExport = publicKeyObject.export({ format: 'jwk' }) as {
  n: string;
  e: string;
  kty: string;
};
const testKid = 'nonce-test-kid';
const mockJwksResponse = {
  keys: [
    {
      kty: jwkExport.kty,
      kid: testKid,
      use: 'sig',
      alg: 'RS256',
      n: jwkExport.n,
      e: jwkExport.e,
    },
  ],
};

const signToken = (payload: Record<string, unknown>): string =>
  jwt.sign(payload, privateKey, {
    algorithm: 'RS256',
    keyid: testKid,
    expiresIn: '1h',
  });

const mockFetch = jest.fn();
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- override global fetch in tests
(global as any).fetch = mockFetch;

describe('social-token-verifier — F3 nonce binding', () => {
  let verifySocialIdToken: typeof import('@modules/auth/adapters/secondary/social/social-token-verifier').verifySocialIdToken;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.resetModules();
    oidcNonceEnforce = false;
    const mod = await import('@modules/auth/adapters/secondary/social/social-token-verifier');
    verifySocialIdToken = mod.verifySocialIdToken;
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockJwksResponse,
    });
  });

  // ── Apple: SHA-256 binding ──────────────────────────────────────────────

  it('accepts an Apple ID token whose nonce claim is sha256(expectedNonce) lowercase hex', async () => {
    const expectedNonce = 'apple-raw-nonce-value';
    const hashedNonce = crypto.createHash('sha256').update(expectedNonce).digest('hex');
    const token = signToken({
      sub: 'apple-user',
      iss: 'https://appleid.apple.com',
      aud: 'com.example.app',
      nonce: hashedNonce,
    });
    const result = await verifySocialIdToken('apple', token, expectedNonce);
    expect(result.providerUserId).toBe('apple-user');
  });

  it('rejects an Apple ID token whose nonce claim is the raw value (not hashed)', async () => {
    const expectedNonce = 'apple-raw-nonce-value';
    const token = signToken({
      sub: 'apple-user',
      iss: 'https://appleid.apple.com',
      aud: 'com.example.app',
      nonce: expectedNonce, // mistakenly raw, not sha256
    });
    await expect(verifySocialIdToken('apple', token, expectedNonce)).rejects.toMatchObject({
      code: 'INVALID_NONCE',
      statusCode: 401,
    });
  });

  it('rejects an Apple ID token whose nonce claim is missing when one was expected', async () => {
    const token = signToken({
      sub: 'apple-user',
      iss: 'https://appleid.apple.com',
      aud: 'com.example.app',
    });
    await expect(verifySocialIdToken('apple', token, 'expected-nonce')).rejects.toMatchObject({
      code: 'INVALID_NONCE',
    });
  });

  // ── Google: direct binding ─────────────────────────────────────────────

  it('accepts a Google ID token whose nonce claim equals the expected nonce verbatim', async () => {
    const expectedNonce = 'google-nonce-abc';
    const token = signToken({
      sub: 'google-user',
      iss: 'https://accounts.google.com',
      aud: 'google-client-id-1',
      nonce: expectedNonce,
    });
    const result = await verifySocialIdToken('google', token, expectedNonce);
    expect(result.providerUserId).toBe('google-user');
  });

  it('rejects a Google ID token whose nonce claim differs from the expected nonce', async () => {
    const token = signToken({
      sub: 'google-user',
      iss: 'https://accounts.google.com',
      aud: 'google-client-id-1',
      nonce: 'attacker-supplied-nonce',
    });
    await expect(verifySocialIdToken('google', token, 'server-issued-nonce')).rejects.toMatchObject(
      {
        code: 'INVALID_NONCE',
      },
    );
  });

  // ── Migration window (oidcNonceEnforce flag) ──────────────────────────

  it('passes when expectedNonce is undefined and enforce=false (legacy mobile build)', async () => {
    oidcNonceEnforce = false;
    const token = signToken({
      sub: 'google-user',
      iss: 'https://accounts.google.com',
      aud: 'google-client-id-1',
    });
    const result = await verifySocialIdToken('google', token);
    expect(result.providerUserId).toBe('google-user');
  });

  it('rejects when expectedNonce is undefined and enforce=true (post-rollout)', async () => {
    oidcNonceEnforce = true;
    const token = signToken({
      sub: 'google-user',
      iss: 'https://accounts.google.com',
      aud: 'google-client-id-1',
    });
    await expect(verifySocialIdToken('google', token)).rejects.toMatchObject({
      code: 'INVALID_NONCE',
    });
  });
});
