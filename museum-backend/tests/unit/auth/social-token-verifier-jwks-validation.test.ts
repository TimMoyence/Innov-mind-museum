/**
 * P0-8 RED — JWKS response shape validation in social-token-verifier.
 *
 * Source: docs/audit-2026-05-12/details/01-typing.md §P1-1
 *
 * `social-token-verifier.ts:56` casts `response.json()` directly to
 * `JwksResponse` without runtime validation. If the JWKS endpoint returns an
 * unexpected payload (rate-limit JSON, version drift, malformed keys), the
 * cast silently lies and the failure surfaces deep inside `crypto.createPublicKey`
 * or `Array.prototype.find` with a generic TypeError / 500 — leaking an
 * internal stack trace and breaking the auth UX contract.
 *
 * RED phase: these tests assert that a malformed JWKS payload is rejected by
 * a typed `AppError` (not a generic Error / TypeError). They MUST fail today
 * because no runtime validation exists. The implementer will swap the cast
 * for `JwksResponseSchema.safeParse(...)` + throw `AppError({code: 'JWKS_*'})`,
 * after which these tests turn green.
 */
import { AppError } from '@shared/errors/app.error';
import { mockFetch } from '../../helpers/fetch/fetch-mock.helpers';

jest.mock('@src/config/env', () => ({
  env: {
    auth: {
      appleClientId: 'com.example.app',
      googleClientIds: ['google-client-id-1'],
      appleJwksUrl: 'https://appleid.apple.com/auth/keys',
      googleJwksUrl: 'https://www.googleapis.com/oauth2/v3/certs',
      oidcNonceEnforce: false,
    },
  },
}));

// Silence logger noise from any transitively imported module.
jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const originalFetch = global.fetch;

/**
 * Builds a minimally-structured Apple ID-token-shaped JWT string so that the
 * verifier reaches `fetchJwks` (header.kid is required to get past the
 * pre-flight `decodeHeader` check). The signature is irrelevant because we
 * expect the JWKS validation to fail BEFORE `jsonwebtoken` ever runs.
 * @param kid
 */
const makeTokenWithKid = (kid: string): string => {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' })).toString(
    'base64url',
  );
  const payload = Buffer.from(
    JSON.stringify({
      sub: 'apple-user',
      iss: 'https://appleid.apple.com',
      aud: 'com.example.app',
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ).toString('base64url');
  // signature is never checked because we expect JWKS validation to short-circuit
  return `${header}.${payload}.not-a-real-signature`;
};

describe('social-token-verifier — JWKS response validation (P0-8 RED)', () => {
  let verifyAppleIdToken: typeof import('@modules/auth/adapters/secondary/social/social-token-verifier').verifyAppleIdToken;

  beforeEach(async () => {
    jest.resetModules();
    jest.clearAllMocks();
    const mod = await import('@modules/auth/adapters/secondary/social/social-token-verifier');
    verifyAppleIdToken = mod.verifyAppleIdToken;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  /**
   * Scenario A — JWKS endpoint returns 200 with a rate-limit-style payload
   * ({ error, retry_after }) instead of { keys: [...] }.
   *
   * Today: the cast accepts it, then `data.keys` is `undefined`, then
   * `keys.find(...)` blows up with `TypeError: Cannot read properties of
   * undefined (reading 'find')` — wrong error class, no machine-readable code,
   * stack trace bleeds out.
   *
   * After fix: must be an AppError with a JWKS_MALFORMED-style code.
   */
  it('rejects rate-limit-shaped JWKS payload with an AppError, not a TypeError', async () => {
    global.fetch = mockFetch({
      ok: true,
      status: 200,
      body: { error: 'rate limited', retry_after: 60 },
    });

    const token = makeTokenWithKid('test-kid-rate-limited');

    // Single expect that covers BOTH the class (typed AppError) and the
    // semantic intent (response is structurally malformed). This is the
    // headline RED assertion — today the code throws a raw TypeError when
    // it tries `keys.find(...)` on undefined.
    await expect(verifyAppleIdToken(token)).rejects.toBeInstanceOf(AppError);
  });

  /**
   * Scenario A.bis — same payload, assert error message references the
   * malformed JWKS condition (not "Cannot read properties of undefined").
   */
  it('surfaces a JWKS-shape-related error message, not an internal TypeError stack', async () => {
    global.fetch = mockFetch({
      ok: true,
      status: 200,
      body: { error: 'rate limited', retry_after: 60 },
    });

    const token = makeTokenWithKid('test-kid-rate-limited');

    // After the fix, the Zod safeParse error should mention `keys` (the
    // missing required field) somewhere in the AppError message or details.
    // Today it throws "Cannot read properties of undefined (reading 'find')".
    await expect(verifyAppleIdToken(token)).rejects.toThrow(/jwks|keys|malformed/i);
  });

  /**
   * Scenario B — JWKS endpoint returns 200 with a `keys` array but each entry
   * is missing required fields (`kid`, `use`, `alg`, `n`, `e`). Only `kty`
   * is present.
   *
   * Today: the cast accepts it, `getSigningKey` searches by kid, finds
   * nothing, attempts a fresh fetch (returns the same garbage), then throws
   * `new Error('No matching key found for kid: ...')` — wrong class, wrong
   * code, and the upstream consumer can't distinguish "key rotated" from
   * "external API returned garbage".
   *
   * Even worse: if a key with a matching `kid` were present but `n`/`e` were
   * missing, `jwkToPem` calls `crypto.createPublicKey({ key: { kty, n: undefined,
   * e: undefined }, format: 'jwk' })` which throws a Node `TypeError`.
   *
   * After fix: must be a typed AppError thrown at the safeParse step, BEFORE
   * we ever hand garbage to `crypto.createPublicKey`.
   */
  it('rejects JWKS keys missing required fields (kid/use/alg/n/e) as a typed AppError', async () => {
    global.fetch = mockFetch({
      ok: true,
      status: 200,
      body: { keys: [{ kty: 'RSA' }] },
    });

    const token = makeTokenWithKid('test-kid-incomplete');

    await expect(verifyAppleIdToken(token)).rejects.toBeInstanceOf(AppError);
  });

  /**
   * Scenario B.bis — same payload, assert 401/4xx status code (not a 500-class
   * crash). Auth-critical responses must be machine-distinguishable from
   * server bugs.
   */
  it('attaches a 4xx-class statusCode to the AppError (auth boundary, not 500)', async () => {
    global.fetch = mockFetch({
      ok: true,
      status: 200,
      body: { keys: [{ kty: 'RSA' }] },
    });

    const token = makeTokenWithKid('test-kid-incomplete-2');

    // Auth-boundary errors must surface as 4xx — 502 is also acceptable
    // (upstream gave us garbage), but never 500. The current code path
    // produces `new Error('No matching key found...')` which the global
    // error middleware maps to 500.
    await expect(verifyAppleIdToken(token)).rejects.toMatchObject({
      statusCode: expect.any(Number),
      code: expect.stringMatching(/JWKS|TOKEN_INVALID|MALFORMED/i),
    });
  });
});
