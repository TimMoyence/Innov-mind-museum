/**
 * T1.2 / R1 — Failing unit test: `verifyGoogleOAuthState` must pass
 * `algorithms: ['HS256']` to `jwt.verify`.
 *
 * CVE-2022-23540 doctrine (lib-docs/jsonwebtoken/PATTERNS.md §3 line 164-167):
 *   DO: Always pass `algorithms` to `verify` — this is the primary mitigation
 *   for CVE-2022-23540 (insecure default algorithm).
 * lib-docs/jsonwebtoken/LESSONS.md §2026-05-18 F1 HIGH:
 *   google-oauth-state.ts MISSING `algorithms` option.
 *
 * RED state (tasks.md T1.2):
 *   `verifyGoogleOAuthState` at google-oauth-state.ts:59 currently calls
 *   `jwt.verify(token, secret, { issuer: STATE_ISSUER })` — NO `algorithms`
 *   key. The spy assertion on `mock.calls[0][2]` FAILS because today's options
 *   object is `{ issuer: 'oauth-google-state' }`, missing the `algorithms` key.
 *
 * Frozen-test invariant: this file is immutable byte-for-byte once committed.
 */

jest.mock('@src/config/env', () => ({
  env: {
    auth: {
      jwtSecret: 'unit-test-state-secret-that-is-long-enough-32c',
    },
  },
}));

import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';

// Import AFTER mock so env is correctly resolved
import { verifyGoogleOAuthState } from '@modules/auth/adapters/secondary/social/google-oauth-state';

const TEST_SECRET = 'unit-test-state-secret-that-is-long-enough-32c';
const STATE_ISSUER = 'oauth-google-state';

describe('R1 — verifyGoogleOAuthState must pass algorithms: ["HS256"] to jwt.verify', () => {
  let verifySpy: jest.SpyInstance;

  beforeEach(() => {
    verifySpy = jest.spyOn(jwt, 'verify');
  });

  afterEach(() => {
    verifySpy.mockRestore();
  });

  /**
   * R1.1 — PRIMARY FAILING ASSERTION.
   * Today the third argument to jwt.verify is { issuer: 'oauth-google-state' },
   * NOT { issuer: 'oauth-google-state', algorithms: ['HS256'] }.
   * This test FAILS until green phase adds the algorithms key.
   */
  it('R1.1 — jwt.verify third argument deep-equals { issuer, algorithms: ["HS256"] }', () => {
    const token = jwt.sign(
      { nonce: 'test-nonce', returnTo: '/fr/admin', platform: 'web' },
      TEST_SECRET,
      { issuer: STATE_ISSUER, expiresIn: 60 },
    );

    // Let the actual jwt.verify run through (not mocked, just spied)
    verifyGoogleOAuthState(token);

    expect(verifySpy).toHaveBeenCalledTimes(1);
    // The third argument (index 2) must be exactly this object.
    // FAILS TODAY because `algorithms` key is absent in the source.
    expect(verifySpy.mock.calls[0][2]).toEqual({
      issuer: STATE_ISSUER,
      algorithms: ['HS256'],
    });
  });

  /**
   * R1.2 — Complementary security test: a token forged with alg "none"
   * (the CVE-2022-23540 attack vector) must be rejected.
   * After green, the explicit algorithms: ['HS256'] option enforces this.
   * Today this may pass or fail depending on jsonwebtoken v9 behaviour with
   * unsigned tokens — we assert it throws regardless.
   */
  it('R1.2 — token forged with algorithm "none" is rejected', () => {
    // jwt v9: unsigned tokens require explicit algorithms: ['none'] opt-in.
    // Forging an unsigned token without that opt-in should throw.
    const unsignedToken = jwt.sign(
      { nonce: 'n', returnTo: '/x', platform: 'web' },
      '', // empty secret for "none" alg
      {
        issuer: STATE_ISSUER,
        expiresIn: 60,
        algorithm: 'none',
      },
    );

    expect(() => verifyGoogleOAuthState(unsignedToken)).toThrow();
  });

  /**
   * R1.3 — Complementary security test: a token signed with RS256
   * (algorithm confusion vector — attacker signs with their own RSA key)
   * must be rejected because the server expects HS256.
   */
  it('R1.3 — token signed with RS256 is rejected (algorithm confusion guard)', () => {
    const { privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });

    const rs256Token = jwt.sign({ nonce: 'n', returnTo: '/x', platform: 'web' }, privateKey, {
      algorithm: 'RS256',
      issuer: STATE_ISSUER,
      expiresIn: 60,
    });

    // Must throw — algorithm mismatch or signature verification failure
    expect(() => verifyGoogleOAuthState(rs256Token)).toThrow();
  });
});
