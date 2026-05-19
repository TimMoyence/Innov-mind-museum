/**
 * T1.4 / R3 — Failing test: `safeJwtVerify` wrapper must REQUIRE
 * `options.algorithms` (TypeScript compile-time + runtime assertion).
 *
 * Design decision D3 (design.md §D3):
 *   Both TypeScript type narrowing AND a runtime assert.
 *   TS narrowing catches the common case; runtime assert is belt-and-braces.
 *
 * lib-docs/jsonwebtoken/PATTERNS.md §3:
 *   DO: Always pass `algorithms` to `verify`.
 * lib-docs/jsonwebtoken/PATTERNS.md §4:
 *   DON'T: Call `verify` without `algorithms`.
 *
 * RED state (tasks.md T1.4):
 *   Sub-test A (TS compile-time guard):
 *     Today `safeJwtVerify` signature is `options: jwt.VerifyOptions` where
 *     `algorithms` is optional. Therefore `// @ts-expect-error` below is
 *     INVALID (TS does not report an error at that call site) →
 *     `tsc --noEmit` reports "Unused '@ts-expect-error' directive" → CI RED.
 *
 *   Sub-test B (runtime assert):
 *     Today `safeJwtVerify` does NOT throw when `algorithms` is absent/empty →
 *     `expect(...).toThrow()` FAILS.
 *
 *   Sub-test C (positive baseline):
 *     Should PASS today (valid RS256 call already works).
 *
 * Frozen-test invariant: this file is immutable byte-for-byte once committed.
 */

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

import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

// Generate a real RSA key pair for sub-test C (positive baseline)
const { publicKey: rsaPublicKey, privateKey: rsaPrivateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

describe('R3 — safeJwtVerify wrapper contract: algorithms is required', () => {
  /**
   * Sub-test A — Runtime guard: calling without `algorithms` (issuer-only) throws.
   *
   * Fix choice (RED-2 re-spawn, BLOCK-TEST-WRONG remediation):
   *   The original R3.A used `@ts-expect-error` + a local `opts: unknown` cast.
   *   The problem: `opts: unknown` widens the parameter so the @ts-expect-error
   *   was PERMANENTLY UNUSED → tsc never exits RED, test could never go GREEN.
   *   See red-respawn-context.md §Finding 1.
   *
   *   Resolution: runtime-only assertion (no @ts-expect-error at all).
   *   The RED signal is that safeJwtVerify is not exported yet (same as R3.B).
   *   After green phase: (1) exports safeJwtVerify, (2) adds runtime guard →
   *   calling with `{ issuer: 'foo' }` (no algorithms key) throws /algorithms/i.
   *   This is complementary to R3.B (empty array) and R3.B2 (undefined) —
   *   R3.A covers the missing-key case (the most common programmer mistake).
   *
   * FAILS today because:
   *   - safeJwtVerify is not exported → test falls into the "not exported" branch
   *     and asserts a deliberate mismatch to signal RED.
   */
  it('R3.A — safeJwtVerify throws when algorithms key is absent from options', async () => {
    jest.resetModules();
    const mod = await import('@modules/auth/adapters/secondary/social/social-token-verifier');
    type ModWithWrapper = typeof mod & {
      safeJwtVerify?: (token: string, key: string, opts: Record<string, unknown>) => jwt.JwtPayload;
    };
    const { safeJwtVerify } = mod as ModWithWrapper;

    if (safeJwtVerify === undefined) {
      // safeJwtVerify not yet exported — green phase must export it.
      expect('safeJwtVerify not exported yet — green phase must export it').toBe(
        'safeJwtVerify exported',
      );
      return;
    }

    // No `algorithms` key at all — should throw after green phase adds runtime guard
    expect(() =>
      safeJwtVerify('tok', 'key', {
        issuer: 'foo',
        // NOTE: no `algorithms` key — the missing-key case distinct from empty [] and undefined
      }),
    ).toThrow(/algorithms/i);
  });

  /**
   * Sub-test B — Runtime assert: calling with empty or absent algorithms throws.
   *
   * FAILS today because current safeJwtVerify does NOT runtime-check algorithms.
   */
  it('R3.B — safeJwtVerify throws when algorithms is an empty array', async () => {
    jest.resetModules();
    const mod = await import('@modules/auth/adapters/secondary/social/social-token-verifier');
    type ModWithWrapper = typeof mod & {
      safeJwtVerify?: (token: string, key: string, opts: Record<string, unknown>) => jwt.JwtPayload;
    };
    const { safeJwtVerify } = mod as ModWithWrapper;

    if (safeJwtVerify === undefined) {
      // safeJwtVerify not yet exported — green phase will export it.
      // Mark test as pending via a clear assertion that communicates intent.
      expect('safeJwtVerify not exported yet — green phase must export it').toBe(
        'safeJwtVerify exported',
      );
      return;
    }

    // Empty algorithms array — should throw after green phase adds runtime guard
    expect(() =>
      safeJwtVerify('tok', 'key', {
        algorithms: [] as unknown,
      }),
    ).toThrow(/algorithms/i);
  });

  /**
   * Sub-test B2 — Runtime assert: calling with algorithms: undefined throws.
   *
   * FAILS today because current safeJwtVerify does NOT runtime-check algorithms.
   */
  it('R3.B2 — safeJwtVerify throws when algorithms is undefined', async () => {
    jest.resetModules();
    const mod = await import('@modules/auth/adapters/secondary/social/social-token-verifier');
    type ModWithWrapper = typeof mod & {
      safeJwtVerify?: (token: string, key: string, opts: Record<string, unknown>) => jwt.JwtPayload;
    };
    const { safeJwtVerify } = mod as ModWithWrapper;

    if (safeJwtVerify === undefined) {
      expect('safeJwtVerify not exported yet — green phase must export it').toBe(
        'safeJwtVerify exported',
      );
      return;
    }

    // algorithms: undefined — should throw after green phase adds runtime guard
    expect(() => safeJwtVerify('tok', 'key', { algorithms: undefined })).toThrow(/algorithms/i);
  });

  /**
   * Sub-test C — Positive baseline: valid RS256 call succeeds.
   *
   * This sub-test PASSES today and after green phase (existing callers already
   * pass algorithms: ['RS256']). It guards that the runtime assert does NOT
   * break well-formed callers.
   *
   * lib-docs/jsonwebtoken/PATTERNS.md §3:
   *   DO: jwt.verify(token, publicKey, { algorithms: ['RS256'] })
   */
  it('R3.C — safeJwtVerify succeeds for valid RS256 token with algorithms: ["RS256"]', async () => {
    jest.resetModules();
    const mod = await import('@modules/auth/adapters/secondary/social/social-token-verifier');
    type ModWithWrapper = typeof mod & {
      safeJwtVerify?: (token: string, key: string, opts: Record<string, unknown>) => jwt.JwtPayload;
    };
    const { safeJwtVerify } = mod as ModWithWrapper;

    if (safeJwtVerify === undefined) {
      // Not yet exported — positive baseline cannot run. Pass to not block.
      expect(true).toBe(true);
      return;
    }

    const idToken = jwt.sign(
      {
        sub: 'google-user-123',
        email: 'user@example.com',
        email_verified: true,
        iss: 'https://accounts.google.com',
        aud: 'test-aud',
      },
      rsaPrivateKey,
      { algorithm: 'RS256', expiresIn: '1h' },
    );

    const decoded = safeJwtVerify(idToken, rsaPublicKey, {
      algorithms: ['RS256'],
      issuer: 'https://accounts.google.com',
      audience: 'test-aud',
    });

    expect(decoded).toMatchObject({ sub: 'google-user-123' });
  });
});
