/**
 * RED — T1.7 — R7 (token substrate) — `mfaSessionToken` MUST carry a per-issue
 * `jti` so a single token can be single-used (denylisted by jti after one
 * successful MFA step).
 *
 * Spec  : team-state/2026-05-26-auth-mfa-rgpd-zerodefect/cycles/T/spec.md §R7.
 * Design: cycles/T/design.md §9 D2 (jti = crypto.randomUUID via jwt jwtid) + D6
 *         (legacy tokens without jti still verify → jti: undefined).
 *
 * Anchored to LESSONS / source (jsonwebtoken PATTERNS.md absent — design OQ1):
 *  - `lib-docs/jsonwebtoken/LESSONS.md` — iss/aud/HS256 pinning is the baseline;
 *    adding a `jti` claim is additive and MUST NOT regress the pinning (R9).
 *  - Source `mfaSessionToken.ts:23-39` — `issueMfaSessionToken` signs WITHOUT a
 *    `jwtid`; `verifyMfaSessionToken` (`:42-66`) returns `{ userId }` only — no
 *    `jti`. So `decoded.jti` is undefined today → the jti assertions fail RED.
 *
 * Run scope:
 *   pnpm jest tests/unit/auth/mfaSessionToken.test.ts
 */

import jwt from 'jsonwebtoken';

import { env } from '@src/config/env';
import {
  issueMfaSessionToken,
  verifyMfaSessionToken,
  MFA_SESSION_TOKEN_ISSUER,
} from '@modules/auth/useCase/totp/mfaSessionToken';

process.env.JWT_ACCESS_TTL = '15m';
process.env.JWT_REFRESH_TTL = '30d';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Future return shape (cycle T) — cast pins the contract; HEAD returns `{userId}` only. */
type VerifyResult = { userId: number; jti: string | undefined };

describe('mfaSessionToken — jti single-use substrate (R7)', () => {
  it('issued token payload carries a uuid-shaped jti', () => {
    const token = issueMfaSessionToken(42);
    const decoded = jwt.decode(token) as { jti?: string } | null;
    expect(decoded).not.toBeNull();
    expect(typeof decoded?.jti).toBe('string'); // fails today — no jwtid signed
    expect(decoded?.jti).toMatch(UUID_RE);
  });

  it('verifyMfaSessionToken returns { userId, jti }', () => {
    const token = issueMfaSessionToken(99);
    const result = verifyMfaSessionToken(token) as unknown as VerifyResult;
    expect(result.userId).toBe(99);
    expect(typeof result.jti).toBe('string'); // fails today — verify returns {userId} only
    expect(result.jti).toMatch(UUID_RE);
  });

  it('two issues produce distinct jti', () => {
    const a = jwt.decode(issueMfaSessionToken(1)) as { jti?: string } | null;
    const b = jwt.decode(issueMfaSessionToken(1)) as { jti?: string } | null;
    expect(a?.jti).toBeDefined();
    expect(b?.jti).toBeDefined();
    expect(a?.jti).not.toBe(b?.jti); // fails today (both undefined)
  });

  it('legacy token signed WITHOUT jti still verifies → jti: undefined (D6 tolerance)', () => {
    // Mint a token exactly like the legacy issuer (no jwtid) to prove a
    // deploy-straddling token does not hard-fail post-deploy.
    const legacy = jwt.sign(
      { sub: '7', type: 'mfa_session', mfaPending: true },
      env.auth.mfaSessionTokenSecret,
      {
        algorithm: 'HS256',
        expiresIn: 300,
        issuer: MFA_SESSION_TOKEN_ISSUER,
        audience: MFA_SESSION_TOKEN_ISSUER,
      },
    );
    const result = verifyMfaSessionToken(legacy) as unknown as VerifyResult;
    expect(result.userId).toBe(7);
    expect(result.jti).toBeUndefined(); // contract: missing jti tolerated, not thrown
  });

  it('iss/aud/HS256 still pinned (R9 — no regression)', () => {
    const token = issueMfaSessionToken(5);
    // Wrong issuer must reject.
    expect(() =>
      jwt.verify(token, env.auth.mfaSessionTokenSecret, {
        algorithms: ['HS256'],
        issuer: 'wrong-issuer',
        audience: MFA_SESSION_TOKEN_ISSUER,
      }),
    ).toThrow();
    // Correct pinning verifies.
    const ok = jwt.verify(token, env.auth.mfaSessionTokenSecret, {
      algorithms: ['HS256'],
      issuer: MFA_SESSION_TOKEN_ISSUER,
      audience: MFA_SESSION_TOKEN_ISSUER,
    }) as { sub: string };
    expect(ok.sub).toBe('5');
  });
});
