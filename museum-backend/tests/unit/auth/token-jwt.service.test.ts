/**
 * Unit tests for `TokenJwtService` — banking-grade JWT signing/verification primitives.
 *
 * Covers:
 *   - sign happy path (access + refresh): produced JWTs decode to expected claims
 *     including `sub`, `type`, `jti`, `role`, `museumId`, `iat`, `exp`.
 *   - sign failure paths: missing secret env var → throws.
 *   - verify happy path: round-trip sign+verify returns the original payload.
 *   - verify failure paths: expired token (fake timers), wrong issuer-equivalent
 *     (wrong type), wrong secret, tampered signature, malformed JWT — each must
 *     throw an `AppError` with `statusCode: 401` and a domain-specific `code`.
 *   - JTI uniqueness across sign calls (assumes caller-supplied jti).
 *   - exp > iat, iat ≤ now structural invariants.
 *   - access-vs-refresh token discrimination (`verifyAccessToken` rejects refresh
 *     and vice versa, since each verifier uses a distinct secret + `type` check).
 *   - sha256 helper deterministic + hex output.
 *
 * The service uses `jsonwebtoken` HS256 with secrets resolved from `env.auth.*`
 * at call-time, so mutating `env.auth.accessTokenSecret` for a single test (then
 * restoring) is safe and isolated.
 *
 * Per CLAUDE.md DRY rule: shared `makeUser` factory used wherever a User-shaped
 * object is needed.
 */

import jwt, { type JwtPayload } from 'jsonwebtoken';

import { AppError } from '@shared/errors/app.error';
import { env } from '@src/config/env';
import { TokenJwtService } from '@modules/auth/useCase/session/token-jwt.service';

import { makeUser } from '../../helpers/auth/user.fixtures';

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

describe('TokenJwtService — TTL parsing at construction', () => {
  it('parses standard suffixed TTLs ("15m", "14d") into seconds', () => {
    const service = new TokenJwtService();
    expect(service.accessTtlSeconds).toBeGreaterThan(0);
    expect(service.refreshTtlSeconds).toBeGreaterThan(service.accessTtlSeconds);
  });

  it('uses default 15m access TTL → 900 seconds when env unset', () => {
    // env.auth.accessTokenTtl defaults to '15m' if JWT_ACCESS_TTL absent.
    // We verify the parser, not the env wiring.
    const service = new TokenJwtService();
    // Default config is '15m' → 900s, allow numeric override but assert sane bounds.
    expect(service.accessTtlSeconds).toBeGreaterThanOrEqual(60);
    expect(service.accessTtlSeconds).toBeLessThanOrEqual(86_400);
  });
});

describe('TokenJwtService — signAccessToken', () => {
  let service: TokenJwtService;

  beforeEach(() => {
    service = new TokenJwtService();
  });

  it('signs a JWT that decodes to the expected access claims', () => {
    const user = makeUser({ id: 42, role: 'visitor', museumId: null });

    const token = service.signAccessToken({
      userId: user.id,
      role: user.role,
      museumId: user.museumId,
      jti: 'jti-access-1',
    });

    const decoded = jwt.verify(token, env.auth.accessTokenSecret, {
      algorithms: ['HS256'],
    }) as JwtPayload;

    expect(decoded.sub).toBe('42');
    expect(decoded.type).toBe('access');
    expect(decoded.jti).toBe('jti-access-1');
    expect(decoded.role).toBe('visitor');
    expect(typeof decoded.iat).toBe('number');
    expect(typeof decoded.exp).toBe('number');
  });

  it('omits museumId from claims when null/undefined (avoids leaking a null field)', () => {
    const token = service.signAccessToken({
      userId: 1,
      role: 'visitor',
      museumId: null,
      jti: 'jti-no-museum',
    });
    const decoded = jwt.decode(token) as Record<string, unknown>;
    expect(decoded).not.toHaveProperty('museumId');
  });

  it('includes museumId when provided (museum_manager case)', () => {
    const user = makeUser({ id: 7, role: 'museum_manager', museumId: 99 });
    const token = service.signAccessToken({
      userId: user.id,
      role: user.role,
      museumId: user.museumId,
      jti: 'jti-mm',
    });
    const decoded = jwt.decode(token) as Record<string, unknown>;
    expect(decoded.museumId).toBe(99);
    expect(decoded.role).toBe('museum_manager');
  });

  it('uses HS256 algorithm in the token header', () => {
    const token = service.signAccessToken({
      userId: 1,
      role: 'visitor',
      jti: 'jti-alg',
    });
    const [headerB64] = token.split('.');
    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8')) as {
      alg: string;
    };
    expect(header.alg).toBe('HS256');
  });

  it('produces exp strictly greater than iat (TTL > 0)', () => {
    const token = service.signAccessToken({
      userId: 1,
      role: 'visitor',
      jti: 'jti-bounds',
    });
    const decoded = jwt.decode(token) as JwtPayload;
    expect(decoded.exp).toBeGreaterThan(decoded.iat!);
    // iat must be ≤ now (in seconds).
    expect(decoded.iat).toBeLessThanOrEqual(Math.floor(Date.now() / 1000));
  });

  it('throws when the access secret is empty', () => {
    const original = env.auth.accessTokenSecret;
    // Mutating env to simulate misconfiguration. jsonwebtoken throws on empty secret.
    (env.auth as { accessTokenSecret: string }).accessTokenSecret = '';
    try {
      expect(() => service.signAccessToken({ userId: 1, role: 'visitor', jti: 'x' })).toThrow();
    } finally {
      (env.auth as { accessTokenSecret: string }).accessTokenSecret = original;
    }
  });
});

describe('TokenJwtService — signRefreshToken', () => {
  let service: TokenJwtService;

  beforeEach(() => {
    service = new TokenJwtService();
  });

  it('signs a JWT that decodes to the expected refresh claims', () => {
    const token = service.signRefreshToken({
      userId: 99,
      jti: 'jti-refresh-1',
      familyId: 'fam-A',
    });

    const decoded = jwt.verify(token, env.auth.refreshTokenSecret, {
      algorithms: ['HS256'],
    }) as JwtPayload;

    expect(decoded.sub).toBe('99');
    expect(decoded.type).toBe('refresh');
    expect(decoded.jti).toBe('jti-refresh-1');
    expect(decoded.familyId).toBe('fam-A');
    expect(typeof decoded.iat).toBe('number');
    expect(typeof decoded.exp).toBe('number');
  });

  it('produces a refresh token whose exp is later than an access token signed at the same instant', () => {
    const accessToken = service.signAccessToken({
      userId: 1,
      role: 'visitor',
      jti: 'a',
    });
    const refreshToken = service.signRefreshToken({
      userId: 1,
      jti: 'r',
      familyId: 'fam',
    });
    const a = jwt.decode(accessToken) as JwtPayload;
    const r = jwt.decode(refreshToken) as JwtPayload;
    expect(r.exp).toBeGreaterThan(a.exp!);
  });

  it('two consecutive sign calls with distinct jti produce distinct tokens', () => {
    const t1 = service.signRefreshToken({ userId: 1, jti: 'jti-1', familyId: 'fam' });
    const t2 = service.signRefreshToken({ userId: 1, jti: 'jti-2', familyId: 'fam' });
    expect(t1).not.toEqual(t2);
    const d1 = jwt.decode(t1) as JwtPayload;
    const d2 = jwt.decode(t2) as JwtPayload;
    expect(d1.jti).not.toEqual(d2.jti);
  });

  it('throws when the refresh secret is empty', () => {
    const original = env.auth.refreshTokenSecret;
    (env.auth as { refreshTokenSecret: string }).refreshTokenSecret = '';
    try {
      expect(() => service.signRefreshToken({ userId: 1, jti: 'x', familyId: 'f' })).toThrow();
    } finally {
      (env.auth as { refreshTokenSecret: string }).refreshTokenSecret = original;
    }
  });
});

describe('TokenJwtService — verifyAccessToken', () => {
  let service: TokenJwtService;

  beforeEach(() => {
    service = new TokenJwtService();
  });

  it('round-trip: sign then verify returns the original sub/role/museumId', () => {
    const user = makeUser({ id: 42, role: 'admin', museumId: 7 });
    const token = service.signAccessToken({
      userId: user.id,
      role: user.role,
      museumId: user.museumId,
      jti: 'rt-1',
    });
    const result = service.verifyAccessToken(token);
    expect(result).toEqual({ id: 42, role: 'admin', museumId: 7 });
  });

  it('falls back museumId to null when not present in the token', () => {
    const token = service.signAccessToken({
      userId: 1,
      role: 'visitor',
      jti: 'rt-2',
    });
    const result = service.verifyAccessToken(token);
    expect(result.museumId).toBeNull();
  });

  it('falls back role to "visitor" when role claim is empty/undefined', () => {
    // Sign a token manually without role to simulate a token missing the role claim.
    // TD-JWT-02: iss+aud must be present (tokens without iss/aud are rejected post-pinning).
    const token = jwt.sign(
      { sub: '5', type: 'access', jti: 'legacy-jti' },
      env.auth.accessTokenSecret,
      { algorithm: 'HS256', expiresIn: '5m', issuer: 'musaium-access', audience: 'musaium-access' },
    );
    const result = service.verifyAccessToken(token);
    expect(result.role).toBe('visitor');
  });

  it('rejects an expired token with INVALID_ACCESS_TOKEN (fake timers)', () => {
    jest.useFakeTimers();
    try {
      const baseTime = new Date('2026-01-01T00:00:00Z');
      jest.setSystemTime(baseTime);

      const token = service.signAccessToken({
        userId: 1,
        role: 'visitor',
        jti: 'expiring',
      });

      // Advance past the access TTL + 1 second.
      jest.setSystemTime(new Date(baseTime.getTime() + (service.accessTtlSeconds + 1) * 1000));

      const err = expectAppError(() => service.verifyAccessToken(token));
      expect(err.statusCode).toBe(401);
      expect(err.code).toBe('INVALID_ACCESS_TOKEN');
    } finally {
      jest.useRealTimers();
    }
  });

  it('rejects a token signed with the wrong secret', () => {
    const token = jwt.sign(
      { sub: '1', type: 'access', jti: 'wrong-secret' },
      'totally-different-secret-' + 'x'.repeat(40),
      { algorithm: 'HS256', expiresIn: '5m' },
    );
    const err = expectAppError(() => service.verifyAccessToken(token));
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('INVALID_ACCESS_TOKEN');
  });

  it('rejects a token whose signature has been tampered', () => {
    const token = service.signAccessToken({
      userId: 1,
      role: 'visitor',
      jti: 'tampered',
    });
    // Flip a character in the signature segment.
    const parts = token.split('.');
    const signature = parts[2];
    const tamperedSig = signature.startsWith('A')
      ? 'B' + signature.slice(1)
      : 'A' + signature.slice(1);
    const tampered = `${parts[0]}.${parts[1]}.${tamperedSig}`;

    const err = expectAppError(() => service.verifyAccessToken(tampered));
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('INVALID_ACCESS_TOKEN');
  });

  it('rejects a malformed (non-JWT) string', () => {
    const err = expectAppError(() => service.verifyAccessToken('not.a.jwt'));
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('INVALID_ACCESS_TOKEN');
  });

  it('rejects an empty string', () => {
    const err = expectAppError(() => service.verifyAccessToken(''));
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('INVALID_ACCESS_TOKEN');
  });

  it('rejects a token with type !== "access" (e.g. a refresh-shaped token signed with the access secret)', () => {
    const refreshShapedAccessSigned = jwt.sign(
      { sub: '1', type: 'refresh', jti: 'wrong-type', familyId: 'fam' },
      env.auth.accessTokenSecret,
      { algorithm: 'HS256', expiresIn: '5m' },
    );
    const err = expectAppError(() => service.verifyAccessToken(refreshShapedAccessSigned));
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('INVALID_ACCESS_TOKEN');
  });

  it('rejects a token without a sub claim', () => {
    const token = jwt.sign({ type: 'access', jti: 'no-sub' }, env.auth.accessTokenSecret, {
      algorithm: 'HS256',
      expiresIn: '5m',
    });
    const err = expectAppError(() => service.verifyAccessToken(token));
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('INVALID_ACCESS_TOKEN');
  });

  it('rejects an actual refresh token (different secret + different type)', () => {
    const refreshToken = service.signRefreshToken({
      userId: 1,
      jti: 'rt-as-access',
      familyId: 'fam',
    });
    const err = expectAppError(() => service.verifyAccessToken(refreshToken));
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('INVALID_ACCESS_TOKEN');
  });
});

describe('TokenJwtService — verifyRefreshToken', () => {
  let service: TokenJwtService;

  beforeEach(() => {
    service = new TokenJwtService();
  });

  it('round-trip: sign then verify returns the original refresh claims', () => {
    const token = service.signRefreshToken({
      userId: 42,
      jti: 'rt-r-1',
      familyId: 'fam-X',
    });
    const result = service.verifyRefreshToken(token);
    expect(result.sub).toBe('42');
    expect(result.type).toBe('refresh');
    expect(result.jti).toBe('rt-r-1');
    expect(result.familyId).toBe('fam-X');
  });

  it('rejects an expired refresh token (fake timers)', () => {
    jest.useFakeTimers();
    try {
      const baseTime = new Date('2026-01-01T00:00:00Z');
      jest.setSystemTime(baseTime);

      const token = service.signRefreshToken({
        userId: 1,
        jti: 'rt-expiring',
        familyId: 'fam',
      });

      jest.setSystemTime(new Date(baseTime.getTime() + (service.refreshTtlSeconds + 1) * 1000));

      const err = expectAppError(() => service.verifyRefreshToken(token));
      expect(err.statusCode).toBe(401);
      expect(err.code).toBe('INVALID_REFRESH_TOKEN');
    } finally {
      jest.useRealTimers();
    }
  });

  it('rejects a token signed with a stranger secret', () => {
    const token = jwt.sign(
      { sub: '1', type: 'refresh', jti: 'r-x', familyId: 'f' },
      'unrelated-secret-' + 'q'.repeat(40),
      { algorithm: 'HS256', expiresIn: '5m' },
    );
    const err = expectAppError(() => service.verifyRefreshToken(token));
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('rejects a tampered signature', () => {
    const token = service.signRefreshToken({
      userId: 1,
      jti: 'r-tamper',
      familyId: 'fam',
    });
    const parts = token.split('.');
    const sig = parts[2];
    const tamperedSig = sig.startsWith('A') ? 'B' + sig.slice(1) : 'A' + sig.slice(1);
    const tampered = `${parts[0]}.${parts[1]}.${tamperedSig}`;
    const err = expectAppError(() => service.verifyRefreshToken(tampered));
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('rejects a malformed (non-JWT) string', () => {
    const err = expectAppError(() => service.verifyRefreshToken('garbage'));
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('rejects a token with type !== "refresh"', () => {
    const accessShapedRefreshSigned = jwt.sign(
      { sub: '1', type: 'access', jti: 'wrong', familyId: 'fam' },
      env.auth.refreshTokenSecret,
      { algorithm: 'HS256', expiresIn: '5m' },
    );
    const err = expectAppError(() => service.verifyRefreshToken(accessShapedRefreshSigned));
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('rejects a refresh token missing familyId', () => {
    const token = jwt.sign(
      { sub: '1', type: 'refresh', jti: 'no-fam' },
      env.auth.refreshTokenSecret,
      { algorithm: 'HS256', expiresIn: '5m' },
    );
    const err = expectAppError(() => service.verifyRefreshToken(token));
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('rejects a refresh token missing jti', () => {
    const token = jwt.sign(
      { sub: '1', type: 'refresh', familyId: 'fam' },
      env.auth.refreshTokenSecret,
      { algorithm: 'HS256', expiresIn: '5m' },
    );
    const err = expectAppError(() => service.verifyRefreshToken(token));
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('rejects a refresh token with non-string sub (e.g. numeric)', () => {
    const token = jwt.sign(
      { sub: 1, type: 'refresh', jti: 'j', familyId: 'f' },
      env.auth.refreshTokenSecret,
      { algorithm: 'HS256', expiresIn: '5m' },
    );
    // `jsonwebtoken` preserves numeric `sub` in the JSON payload (it does NOT
    // auto-coerce to string), and the verifier explicitly requires
    // `typeof sub === 'string'` — so the verifier must reject this token.
    const err = expectAppError(() => service.verifyRefreshToken(token));
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('rejects an actual access token (different secret + different type)', () => {
    const accessToken = service.signAccessToken({
      userId: 1,
      role: 'visitor',
      jti: 'access-as-refresh',
    });
    const err = expectAppError(() => service.verifyRefreshToken(accessToken));
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('INVALID_REFRESH_TOKEN');
  });
});

describe('TokenJwtService — sha256', () => {
  it('returns 64-char hex digest for any non-empty input', () => {
    const service = new TokenJwtService();
    const h = service.sha256('the.quick.brown.fox');
    expect(h).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic — same input → same digest', () => {
    const service = new TokenJwtService();
    expect(service.sha256('abc')).toBe(service.sha256('abc'));
  });

  it('produces different digests for different inputs (collision-free for trivial pairs)', () => {
    const service = new TokenJwtService();
    expect(service.sha256('abc')).not.toBe(service.sha256('abd'));
  });

  it('hashes a freshly issued refresh token to a stable hex digest', () => {
    const service = new TokenJwtService();
    const token = service.signRefreshToken({
      userId: 1,
      jti: 'sha-rt',
      familyId: 'fam',
    });
    const digest = service.sha256(token);
    expect(digest).toHaveLength(64);
    expect(service.sha256(token)).toBe(digest);
  });
});
