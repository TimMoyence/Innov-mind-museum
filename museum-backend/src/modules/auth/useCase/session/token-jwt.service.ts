import crypto from 'node:crypto';

import jwt, { type JwtPayload } from 'jsonwebtoken';

import { AppError } from '@shared/errors/app.error';
import { env } from '@src/config/env';

import type { UserRole } from '@modules/auth/domain/user/user-role';

interface AccessTokenClaims extends JwtPayload {
  sub: string;
  type: 'access';
  jti: string;
  role?: UserRole;
  museumId?: number | null;
}

/** Decoded shape of a refresh JWT after `verifyRefreshToken` narrows it. */
export interface RefreshTokenClaims extends JwtPayload {
  sub: string;
  type: 'refresh';
  jti: string;
  familyId: string;
}

const unauthorized = (message: string, code = 'UNAUTHORIZED'): AppError => {
  return new AppError({
    message,
    statusCode: 401,
    code,
  });
};

const ttlToSeconds = (value: string): number => {
  const raw = value.trim();
  if (!raw) return 0;
  if (/^\d+$/.test(raw)) {
    return Number(raw);
  }

  const match = /^(\d+)\s*([smhd])$/i.exec(raw);
  if (!match) {
    throw new Error(`Unsupported JWT TTL format: ${value}`);
  }

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers: Record<string, number> = {
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
  };

  return amount * multipliers[unit];
};

/**
 * JWT plumbing for the auth session pipeline: signs/verifies access + refresh
 * tokens, hashes refresh-token plaintext for tamper detection, and exposes
 * resolved TTLs (in seconds) so siblings don't re-parse `env.auth.*TokenTtl`.
 *
 * Stateless and DB-free. Reads `env.auth.*` once at construction.
 */
export class TokenJwtService {
  readonly accessTtlSeconds = ttlToSeconds(env.auth.accessTokenTtl);
  readonly refreshTtlSeconds = ttlToSeconds(env.auth.refreshTokenTtl);

  /** Verify and narrow an access JWT. Throws 401 AppError on any failure. */
  verifyAccessToken(token: string): { id: number; role: UserRole; museumId?: number | null } {
    try {
      const decoded = jwt.verify(token, env.auth.accessTokenSecret, {
        algorithms: ['HS256'],
      }) as AccessTokenClaims;
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive: JWT payload may not match expected type at runtime
      if (decoded.type !== 'access' || !decoded.sub) {
        throw unauthorized('Invalid access token', 'INVALID_ACCESS_TOKEN');
      }

      return {
        id: Number(decoded.sub),
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty string fallback
        role: decoded.role || 'visitor',
        museumId: decoded.museumId ?? null,
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      throw unauthorized('Invalid access token', 'INVALID_ACCESS_TOKEN');
    }
  }

  /** Verify and narrow a refresh JWT. Throws 401 AppError on any failure. */
  verifyRefreshToken(token: string): RefreshTokenClaims {
    try {
      const decoded = jwt.verify(token, env.auth.refreshTokenSecret, {
        algorithms: ['HS256'],
      }) as RefreshTokenClaims;
      /* eslint-disable @typescript-eslint/no-unnecessary-condition -- defensive: JWT payload may not match expected type at runtime */
      if (
        decoded.type !== 'refresh' ||
        typeof decoded.sub !== 'string' ||
        typeof decoded.jti !== 'string' ||
        typeof decoded.familyId !== 'string'
      ) {
        /* eslint-enable @typescript-eslint/no-unnecessary-condition */
        throw unauthorized('Invalid refresh token', 'INVALID_REFRESH_TOKEN');
      }

      return decoded;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw unauthorized('Invalid refresh token', 'INVALID_REFRESH_TOKEN');
    }
  }

  /** Sign an access JWT for `userId` with the given claim envelope. */
  signAccessToken(params: {
    userId: number;
    role: UserRole;
    museumId?: number | null;
    jti: string;
  }): string {
    return jwt.sign(
      {
        sub: String(params.userId),
        type: 'access',
        jti: params.jti,
        role: params.role,
        ...(params.museumId ? { museumId: params.museumId } : {}),
      },
      env.auth.accessTokenSecret,
      { algorithm: 'HS256', expiresIn: env.auth.accessTokenTtl as jwt.SignOptions['expiresIn'] },
    );
  }

  /** Sign a refresh JWT bound to a token family. */
  signRefreshToken(params: { userId: number; jti: string; familyId: string }): string {
    return jwt.sign(
      {
        sub: String(params.userId),
        type: 'refresh',
        jti: params.jti,
        familyId: params.familyId,
      },
      env.auth.refreshTokenSecret,
      { algorithm: 'HS256', expiresIn: env.auth.refreshTokenTtl as jwt.SignOptions['expiresIn'] },
    );
  }

  /** SHA-256 hex digest. Used to persist a tamper-detectable copy of the refresh JWT. */
  sha256(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
  }
}
