jest.mock('@src/config/env', () => ({
  env: {
    auth: {
      accessTokenSecret: 'unit-test-access-secret-that-is-at-least-32c',
      refreshTokenSecret: 'unit-test-refresh-secret-that-is-at-least-32c',
      accessTokenTtl: '15m',
      refreshTokenTtl: '14d',
    },
  },
}));

import jwt, { type JwtPayload } from 'jsonwebtoken';

import { AppError } from '@shared/errors/app.error';

const ACCESS_SECRET = 'unit-test-access-secret-that-is-at-least-32c';
const REFRESH_SECRET = 'unit-test-refresh-secret-that-is-at-least-32c';

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

describe('TD-JWT-02 — cross-cast attack: access payload signed with refresh secret', () => {
  it('verifyAccessToken rejects an access-shaped token signed with the refresh secret even if iss is "musaium-access"', async () => {
    const { TokenJwtService } = await import('@modules/auth/useCase/session/token-jwt.service');
    const service = new TokenJwtService();

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

    const err = expectAppError(() => service.verifyAccessToken(spoofedToken));
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('INVALID_ACCESS_TOKEN');
  });
});
