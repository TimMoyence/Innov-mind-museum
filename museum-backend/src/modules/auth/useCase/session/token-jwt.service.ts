import crypto from 'node:crypto';

import jwt, { type JwtPayload } from 'jsonwebtoken';

import { AppError } from '@shared/errors/app.error';
import { env } from '@src/config/env';

import type { UserRole } from '@modules/auth/domain/user/user-role';

// lib-docs/jsonwebtoken/PATTERNS.md §3: DO pin iss+aud on every internal token
// to prevent token-confusion across token families (defense-in-depth).
export const ACCESS_TOKEN_ISSUER = 'musaium-access';
export const REFRESH_TOKEN_ISSUER = 'musaium-refresh';

interface AccessTokenClaims extends JwtPayload {
  sub: string;
  type: 'access';
  jti: string;
  role?: UserRole;
  museumId?: number | null;
}

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

/** Stateless, DB-free. Reads `env.auth.*` once at construction. */
export class TokenJwtService {
  readonly accessTtlSeconds = ttlToSeconds(env.auth.accessTokenTtl);
  readonly refreshTtlSeconds = ttlToSeconds(env.auth.refreshTokenTtl);

  /** @throws {Error} 401 AppError on any failure. */
  verifyAccessToken(token: string): { id: number; role: UserRole; museumId?: number | null } {
    try {
      // lib-docs/jsonwebtoken/PATTERNS.md §3: pin iss+aud to reject cross-family tokens.
      const decoded = jwt.verify(token, env.auth.accessTokenSecret, {
        algorithms: ['HS256'],
        issuer: ACCESS_TOKEN_ISSUER,
        audience: ACCESS_TOKEN_ISSUER,
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

  /** @throws {Error} 401 AppError on any failure. */
  verifyRefreshToken(token: string): RefreshTokenClaims {
    try {
      // lib-docs/jsonwebtoken/PATTERNS.md §3: pin iss+aud to reject cross-family tokens.
      const decoded = jwt.verify(token, env.auth.refreshTokenSecret, {
        algorithms: ['HS256'],
        issuer: REFRESH_TOKEN_ISSUER,
        audience: REFRESH_TOKEN_ISSUER,
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

  signAccessToken(params: {
    userId: number;
    role: UserRole;
    museumId?: number | null;
    jti: string;
  }): string {
    // lib-docs/jsonwebtoken/PATTERNS.md §3: pin iss+aud on every internal token.
    return jwt.sign(
      {
        sub: String(params.userId),
        type: 'access',
        jti: params.jti,
        role: params.role,
        ...(params.museumId ? { museumId: params.museumId } : {}),
      },
      env.auth.accessTokenSecret,
      {
        algorithm: 'HS256',
        expiresIn: env.auth.accessTokenTtl as jwt.SignOptions['expiresIn'],
        issuer: ACCESS_TOKEN_ISSUER,
        audience: ACCESS_TOKEN_ISSUER,
      },
    );
  }

  /** Bound to a token family. */
  signRefreshToken(params: { userId: number; jti: string; familyId: string }): string {
    // lib-docs/jsonwebtoken/PATTERNS.md §3: pin iss+aud on every internal token.
    return jwt.sign(
      {
        sub: String(params.userId),
        type: 'refresh',
        jti: params.jti,
        familyId: params.familyId,
      },
      env.auth.refreshTokenSecret,
      {
        algorithm: 'HS256',
        expiresIn: env.auth.refreshTokenTtl as jwt.SignOptions['expiresIn'],
        issuer: REFRESH_TOKEN_ISSUER,
        audience: REFRESH_TOKEN_ISSUER,
      },
    );
  }

  /** SHA-256 hex — tamper-detectable copy of the refresh JWT. */
  sha256(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
  }
}
