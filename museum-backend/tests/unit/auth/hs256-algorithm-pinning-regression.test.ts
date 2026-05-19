/**
 * T1.3 / R2 — Regression guard: the 3 already-secured symmetric jwt.verify
 * sites continue to pass `algorithms: ['HS256']`.
 *
 * Sites (design.md §D2):
 *   1. mfaSessionToken.ts:40  — verifyMfaSessionToken
 *   2. token-jwt.service.ts:65 — TokenJwtService.verifyAccessToken
 *   3. token-jwt.service.ts:91 — TokenJwtService.verifyRefreshToken
 *
 * lib-docs/jsonwebtoken/PATTERNS.md §3 line 164-167:
 *   DO: Always pass `algorithms` to `verify`.
 * lib-docs/jsonwebtoken/PATTERNS.md §5:
 *   `algorithms` is the #1 footgun; explicit allow-listing is the secure pattern.
 *
 * RED state (tasks.md T1.3):
 *   These tests PASS today (the invariant already holds). They exist as
 *   regression guards — if green phase accidentally removes an `algorithms`
 *   option, the corresponding assertion fails and CI stops the regression.
 *   Per tasks.md T1.3 NOTE: editor MUST NOT remove existing `algorithms` from
 *   these sites to "make T1.3 red first".
 *
 * Frozen-test invariant: this file is immutable byte-for-byte once committed.
 */

jest.mock('@src/config/env', () => ({
  env: {
    auth: {
      accessTokenSecret: 'unit-test-access-secret-that-is-at-least-32c',
      refreshTokenSecret: 'unit-test-refresh-secret-that-is-at-least-32c',
      mfaSessionTokenSecret: 'unit-test-mfa-session-secret-at-least-32-chars',
      accessTokenTtl: '15m',
      refreshTokenTtl: '14d',
      mfaSessionTokenTtlSeconds: 300,
    },
  },
}));

import jwt from 'jsonwebtoken';

const ACCESS_SECRET = 'unit-test-access-secret-that-is-at-least-32c';
const REFRESH_SECRET = 'unit-test-refresh-secret-that-is-at-least-32c';
const MFA_SESSION_SECRET = 'unit-test-mfa-session-secret-at-least-32-chars';

describe('R2 — Already-secured HS256 sites regression guard', () => {
  let verifySpy: jest.SpyInstance;

  beforeEach(() => {
    verifySpy = jest.spyOn(jwt, 'verify');
  });

  afterEach(() => {
    verifySpy.mockRestore();
  });

  /**
   * R2.1 — verifyMfaSessionToken passes algorithms: ['HS256']
   * Source: mfaSessionToken.ts:40
   */
  it('R2.1 — verifyMfaSessionToken passes algorithms: ["HS256"] to jwt.verify', async () => {
    // Import after mock and spy setup
    const { verifyMfaSessionToken } = await import('@modules/auth/useCase/totp/mfaSessionToken');

    const validToken = jwt.sign(
      { sub: '42', type: 'mfa_session', mfaPending: true },
      MFA_SESSION_SECRET,
      { algorithm: 'HS256', expiresIn: 300 },
    );

    // Call the function — let it run through
    verifyMfaSessionToken(validToken);

    expect(verifySpy).toHaveBeenCalledTimes(1);
    const callArgs = verifySpy.mock.calls[0];
    // Third argument must include algorithms: ['HS256']
    expect(callArgs[2]).toMatchObject({ algorithms: ['HS256'] });
    // Ensure 'none' never appears (R5 coverage at this site)
    expect(callArgs[2]).not.toMatchObject({ algorithms: expect.arrayContaining(['none']) });
  });

  /**
   * R2.2 — TokenJwtService.verifyAccessToken passes algorithms: ['HS256']
   * Source: token-jwt.service.ts:65
   *
   * Note: import is done at the top of the describe block scope to share the
   * same module instance (and therefore the same jwt singleton) as the spy.
   * jest.resetModules() would create a new jwt instance bypassing the spy.
   */
  it('R2.2 — TokenJwtService.verifyAccessToken passes algorithms: ["HS256"] to jwt.verify', async () => {
    // Import within the same module registry so the spy on jwt.verify intercepts.
    const { TokenJwtService } = await import('@modules/auth/useCase/session/token-jwt.service');
    const service = new TokenJwtService();

    const validAccessToken = jwt.sign(
      { sub: '1', type: 'access', jti: 'test-jti-access', role: 'visitor' },
      ACCESS_SECRET,
      { algorithm: 'HS256', expiresIn: '15m' },
    );

    service.verifyAccessToken(validAccessToken);

    expect(verifySpy).toHaveBeenCalledTimes(1);
    const callArgs = verifySpy.mock.calls[0];
    expect(callArgs[2]).toMatchObject({ algorithms: ['HS256'] });
    expect(callArgs[2]).not.toMatchObject({ algorithms: expect.arrayContaining(['none']) });
  });

  /**
   * R2.3 — TokenJwtService.verifyRefreshToken passes algorithms: ['HS256']
   * Source: token-jwt.service.ts:91
   */
  it('R2.3 — TokenJwtService.verifyRefreshToken passes algorithms: ["HS256"] to jwt.verify', async () => {
    const { TokenJwtService } = await import('@modules/auth/useCase/session/token-jwt.service');
    const service = new TokenJwtService();

    const validRefreshToken = jwt.sign(
      {
        sub: '1',
        type: 'refresh',
        jti: 'test-jti-refresh',
        familyId: 'test-family-id',
      },
      REFRESH_SECRET,
      { algorithm: 'HS256', expiresIn: '14d' },
    );

    service.verifyRefreshToken(validRefreshToken);

    expect(verifySpy).toHaveBeenCalledTimes(1);
    const callArgs = verifySpy.mock.calls[0];
    expect(callArgs[2]).toMatchObject({ algorithms: ['HS256'] });
    expect(callArgs[2]).not.toMatchObject({ algorithms: expect.arrayContaining(['none']) });
  });
});
