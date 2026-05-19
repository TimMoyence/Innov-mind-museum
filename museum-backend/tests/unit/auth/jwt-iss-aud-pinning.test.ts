/**
 * TD-JWT-02 — iss/aud pinning on internal HS256 tokens (defense-in-depth).
 *
 * lib-docs/jsonwebtoken/PATTERNS.md §3 (line 187-190):
 *   DO: Always check `aud` and `iss` when validating tokens from a known issuer.
 *   "Skipping them allows token-confusion across audiences (same signing key,
 *    different intended recipients)."
 *
 * Covered scenarios:
 *   1. signAccessToken  produces a JWT with iss === 'musaium-access' AND aud === 'musaium-access'.
 *   2. verifyAccessToken rejects a token with wrong iss (throws INVALID_ACCESS_TOKEN).
 *   3. verifyAccessToken rejects a token with missing iss/aud claims.
 *   4. Same for refresh tokens (iss/aud === 'musaium-refresh').
 *   5. Same for mfa-session tokens (iss/aud === 'musaium-mfa-session').
 *   6. Cross-cast attack: access token payload signed with the refresh secret must
 *      FAIL verifyAccessToken — layered defense (signature mismatch).
 *
 * RED state: these tests FAIL on the current code because iss/aud are not pinned.
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

import jwt, { type JwtPayload } from 'jsonwebtoken';

import { AppError } from '@shared/errors/app.error';

const ACCESS_SECRET = 'unit-test-access-secret-that-is-at-least-32c';
const REFRESH_SECRET = 'unit-test-refresh-secret-that-is-at-least-32c';
const MFA_SESSION_SECRET = 'unit-test-mfa-session-secret-at-least-32-chars';

// Helper: assert a synchronous function throws AppError and return it.
const expectAppError = (fn: () => unknown): AppError => {
  try {
    fn();
  } catch (error) {
    if (!(error instanceof AppError)) {
      throw new Error(`Expected AppError, got: ${String(error)}`, { cause: error });
    }
    return error;
  }
  throw new Error('Expected function to throw AppError, but it did not throw');
};

// ──────────────────────────────────────────────────────────────────────────────
// Access token — iss/aud pinning
// ──────────────────────────────────────────────────────────────────────────────
describe('TD-JWT-02 — access token iss/aud pinning', () => {
  let TokenJwtService: typeof import('@modules/auth/useCase/session/token-jwt.service').TokenJwtService;
  let ACCESS_TOKEN_ISSUER: string;

  beforeAll(async () => {
    const mod = await import('@modules/auth/useCase/session/token-jwt.service');
    TokenJwtService = mod.TokenJwtService;
    ACCESS_TOKEN_ISSUER = mod.ACCESS_TOKEN_ISSUER;
  });

  it('exports ACCESS_TOKEN_ISSUER constant equal to "musaium-access"', () => {
    expect(ACCESS_TOKEN_ISSUER).toBe('musaium-access');
  });

  it('signAccessToken produces a JWT with iss === "musaium-access"', () => {
    const service = new TokenJwtService();
    const token = service.signAccessToken({ userId: 1, role: 'visitor', jti: 'jti-iss-1' });
    const decoded = jwt.decode(token) as JwtPayload;
    expect(decoded.iss).toBe('musaium-access');
  });

  it('signAccessToken produces a JWT with aud === "musaium-access"', () => {
    const service = new TokenJwtService();
    const token = service.signAccessToken({ userId: 1, role: 'visitor', jti: 'jti-aud-1' });
    const decoded = jwt.decode(token) as JwtPayload;
    // aud may be a string or string[] per JwtPayload — normalise.
    const aud = Array.isArray(decoded.aud) ? decoded.aud[0] : decoded.aud;
    expect(aud).toBe('musaium-access');
  });

  it('verifyAccessToken accepts a correctly-issued access token (round-trip)', () => {
    const service = new TokenJwtService();
    const token = service.signAccessToken({ userId: 42, role: 'admin', jti: 'jti-rt' });
    expect(() => service.verifyAccessToken(token)).not.toThrow();
  });

  it('verifyAccessToken rejects a token with wrong iss (INVALID_ACCESS_TOKEN)', () => {
    const service = new TokenJwtService();
    // Manually craft a token with wrong issuer but correct secret.
    const token = jwt.sign({ sub: '1', type: 'access', jti: 'bad-iss' }, ACCESS_SECRET, {
      algorithm: 'HS256',
      expiresIn: '5m',
      issuer: 'wrong-issuer',
      audience: 'musaium-access',
    });
    const err = expectAppError(() => service.verifyAccessToken(token));
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('INVALID_ACCESS_TOKEN');
  });

  it('verifyAccessToken rejects a token with missing iss (INVALID_ACCESS_TOKEN)', () => {
    const service = new TokenJwtService();
    const token = jwt.sign({ sub: '1', type: 'access', jti: 'no-iss' }, ACCESS_SECRET, {
      algorithm: 'HS256',
      expiresIn: '5m',
    });
    const err = expectAppError(() => service.verifyAccessToken(token));
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('INVALID_ACCESS_TOKEN');
  });

  it('verifyAccessToken rejects a token with missing aud (INVALID_ACCESS_TOKEN)', () => {
    const service = new TokenJwtService();
    const token = jwt.sign({ sub: '1', type: 'access', jti: 'no-aud' }, ACCESS_SECRET, {
      algorithm: 'HS256',
      expiresIn: '5m',
      issuer: 'musaium-access',
    });
    const err = expectAppError(() => service.verifyAccessToken(token));
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('INVALID_ACCESS_TOKEN');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Refresh token — iss/aud pinning
// ──────────────────────────────────────────────────────────────────────────────
describe('TD-JWT-02 — refresh token iss/aud pinning', () => {
  let TokenJwtService: typeof import('@modules/auth/useCase/session/token-jwt.service').TokenJwtService;
  let REFRESH_TOKEN_ISSUER: string;

  beforeAll(async () => {
    const mod = await import('@modules/auth/useCase/session/token-jwt.service');
    TokenJwtService = mod.TokenJwtService;
    REFRESH_TOKEN_ISSUER = mod.REFRESH_TOKEN_ISSUER;
  });

  it('exports REFRESH_TOKEN_ISSUER constant equal to "musaium-refresh"', () => {
    expect(REFRESH_TOKEN_ISSUER).toBe('musaium-refresh');
  });

  it('signRefreshToken produces a JWT with iss === "musaium-refresh"', () => {
    const service = new TokenJwtService();
    const token = service.signRefreshToken({ userId: 1, jti: 'jti-iss-r', familyId: 'fam' });
    const decoded = jwt.decode(token) as JwtPayload;
    expect(decoded.iss).toBe('musaium-refresh');
  });

  it('signRefreshToken produces a JWT with aud === "musaium-refresh"', () => {
    const service = new TokenJwtService();
    const token = service.signRefreshToken({ userId: 1, jti: 'jti-aud-r', familyId: 'fam' });
    const decoded = jwt.decode(token) as JwtPayload;
    const aud = Array.isArray(decoded.aud) ? decoded.aud[0] : decoded.aud;
    expect(aud).toBe('musaium-refresh');
  });

  it('verifyRefreshToken accepts a correctly-issued refresh token (round-trip)', () => {
    const service = new TokenJwtService();
    const token = service.signRefreshToken({ userId: 42, jti: 'jti-rt-r', familyId: 'fam-Z' });
    expect(() => service.verifyRefreshToken(token)).not.toThrow();
  });

  it('verifyRefreshToken rejects a token with wrong iss (INVALID_REFRESH_TOKEN)', () => {
    const service = new TokenJwtService();
    const token = jwt.sign(
      { sub: '1', type: 'refresh', jti: 'bad-iss-r', familyId: 'fam' },
      REFRESH_SECRET,
      { algorithm: 'HS256', expiresIn: '5m', issuer: 'wrong-issuer', audience: 'musaium-refresh' },
    );
    const err = expectAppError(() => service.verifyRefreshToken(token));
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('verifyRefreshToken rejects a token with missing iss (INVALID_REFRESH_TOKEN)', () => {
    const service = new TokenJwtService();
    const token = jwt.sign(
      { sub: '1', type: 'refresh', jti: 'no-iss-r', familyId: 'fam' },
      REFRESH_SECRET,
      { algorithm: 'HS256', expiresIn: '5m' },
    );
    const err = expectAppError(() => service.verifyRefreshToken(token));
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('INVALID_REFRESH_TOKEN');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// MFA-session token — iss/aud pinning
// ──────────────────────────────────────────────────────────────────────────────
describe('TD-JWT-02 — mfa-session token iss/aud pinning', () => {
  let issueMfaSessionToken: typeof import('@modules/auth/useCase/totp/mfaSessionToken').issueMfaSessionToken;
  let verifyMfaSessionToken: typeof import('@modules/auth/useCase/totp/mfaSessionToken').verifyMfaSessionToken;
  let MFA_SESSION_TOKEN_ISSUER: string;

  beforeAll(async () => {
    const mod = await import('@modules/auth/useCase/totp/mfaSessionToken');
    issueMfaSessionToken = mod.issueMfaSessionToken;
    verifyMfaSessionToken = mod.verifyMfaSessionToken;
    MFA_SESSION_TOKEN_ISSUER = mod.MFA_SESSION_TOKEN_ISSUER;
  });

  it('exports MFA_SESSION_TOKEN_ISSUER constant equal to "musaium-mfa-session"', () => {
    expect(MFA_SESSION_TOKEN_ISSUER).toBe('musaium-mfa-session');
  });

  it('issueMfaSessionToken produces a JWT with iss === "musaium-mfa-session"', () => {
    const token = issueMfaSessionToken(7);
    const decoded = jwt.decode(token) as JwtPayload;
    expect(decoded.iss).toBe('musaium-mfa-session');
  });

  it('issueMfaSessionToken produces a JWT with aud === "musaium-mfa-session"', () => {
    const token = issueMfaSessionToken(7);
    const decoded = jwt.decode(token) as JwtPayload;
    const aud = Array.isArray(decoded.aud) ? decoded.aud[0] : decoded.aud;
    expect(aud).toBe('musaium-mfa-session');
  });

  it('verifyMfaSessionToken accepts a correctly-issued mfa-session token (round-trip)', () => {
    const token = issueMfaSessionToken(99);
    expect(() => verifyMfaSessionToken(token)).not.toThrow();
  });

  it('verifyMfaSessionToken rejects a token with wrong iss (INVALID_MFA_SESSION)', () => {
    const token = jwt.sign(
      { sub: '1', type: 'mfa_session', mfaPending: true },
      MFA_SESSION_SECRET,
      {
        algorithm: 'HS256',
        expiresIn: 300,
        issuer: 'wrong-issuer',
        audience: 'musaium-mfa-session',
      },
    );
    const err = expectAppError(() => verifyMfaSessionToken(token));
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('INVALID_MFA_SESSION');
  });

  it('verifyMfaSessionToken rejects a token with missing iss (INVALID_MFA_SESSION)', () => {
    const token = jwt.sign(
      { sub: '1', type: 'mfa_session', mfaPending: true },
      MFA_SESSION_SECRET,
      { algorithm: 'HS256', expiresIn: 300 },
    );
    const err = expectAppError(() => verifyMfaSessionToken(token));
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('INVALID_MFA_SESSION');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Cross-cast attack scenario — layered defense assertion
// ──────────────────────────────────────────────────────────────────────────────
describe('TD-JWT-02 — cross-cast attack: access payload signed with refresh secret', () => {
  it('verifyAccessToken rejects an access-shaped token signed with the refresh secret even if iss is "musaium-access"', async () => {
    const { TokenJwtService } = await import('@modules/auth/useCase/session/token-jwt.service');
    const service = new TokenJwtService();

    // Attacker creates a token with the "correct" issuer for access but signs it
    // with the REFRESH secret (i.e. they somehow obtained the refresh secret).
    const spoofedToken = jwt.sign(
      { sub: '1', type: 'access', jti: 'cross-cast', role: 'admin' },
      REFRESH_SECRET,
      {
        algorithm: 'HS256',
        expiresIn: '5m',
        issuer: 'musaium-access',
        audience: 'musaium-access',
      },
    );

    // The token claims the right iss/aud but was signed with a different secret.
    // verifyAccessToken must reject it (signature mismatch).
    const err = expectAppError(() => service.verifyAccessToken(spoofedToken));
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('INVALID_ACCESS_TOKEN');
  });
});
