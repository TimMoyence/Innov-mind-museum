import crypto from 'node:crypto';

import jwt, { type JwtPayload } from 'jsonwebtoken';

import { AppError, unauthorized } from '@shared/errors/app.error';
import { nonEmpty } from '@shared/utils/defaults';
import { env } from '@src/config/env';

import type { UserRole } from '@modules/auth/domain/user/user-role';

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

const INVALID_ACCESS_TOKEN_MSG = 'Invalid access token';
const INVALID_ACCESS_TOKEN_CODE = 'INVALID_ACCESS_TOKEN';

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

export class TokenJwtService {
  readonly accessTtlSeconds = ttlToSeconds(env.auth.accessTokenTtl);
  readonly refreshTtlSeconds = ttlToSeconds(env.auth.refreshTokenTtl);

  verifyAccessTokenWithClaims(token: string): {
    id: number;
    role: UserRole;
    museumId?: number | null;
    jti: string;
    expSec: number;
  } {
    try {
      const decoded = jwt.verify(token, env.auth.accessTokenSecret, {
        algorithms: ['HS256'],
        issuer: ACCESS_TOKEN_ISSUER,
        audience: ACCESS_TOKEN_ISSUER,
      }) as Partial<AccessTokenClaims>;
      if (decoded.type !== 'access' || !decoded.sub || typeof decoded.jti !== 'string') {
        throw unauthorized(INVALID_ACCESS_TOKEN_MSG, INVALID_ACCESS_TOKEN_CODE);
      }
      const expSec = typeof decoded.exp === 'number' ? decoded.exp : 0;
      return {
        id: Number(decoded.sub),
        role: nonEmpty(decoded.role) ?? 'visitor',
        museumId: decoded.museumId ?? null,
        jti: decoded.jti,
        expSec,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw unauthorized(INVALID_ACCESS_TOKEN_MSG, INVALID_ACCESS_TOKEN_CODE);
    }
  }

  verifyAccessToken(token: string): { id: number; role: UserRole; museumId?: number | null } {
    try {
      const decoded = jwt.verify(token, env.auth.accessTokenSecret, {
        algorithms: ['HS256'],
        issuer: ACCESS_TOKEN_ISSUER,
        audience: ACCESS_TOKEN_ISSUER,
      }) as Partial<AccessTokenClaims>;
      if (decoded.type !== 'access' || !decoded.sub) {
        throw unauthorized(INVALID_ACCESS_TOKEN_MSG, INVALID_ACCESS_TOKEN_CODE);
      }

      return {
        id: Number(decoded.sub),
        role: nonEmpty(decoded.role) ?? 'visitor',
        museumId: decoded.museumId ?? null,
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      throw unauthorized(INVALID_ACCESS_TOKEN_MSG, INVALID_ACCESS_TOKEN_CODE);
    }
  }

  verifyRefreshToken(token: string): RefreshTokenClaims {
    try {
      const decoded = jwt.verify(token, env.auth.refreshTokenSecret, {
        algorithms: ['HS256'],
        issuer: REFRESH_TOKEN_ISSUER,
        audience: REFRESH_TOKEN_ISSUER,
      }) as Partial<RefreshTokenClaims>;
      if (
        decoded.type !== 'refresh' ||
        typeof decoded.sub !== 'string' ||
        typeof decoded.jti !== 'string' ||
        typeof decoded.familyId !== 'string'
      ) {
        throw unauthorized('Invalid refresh token', 'INVALID_REFRESH_TOKEN');
      }

      return {
        ...decoded,
        sub: decoded.sub,
        type: decoded.type,
        jti: decoded.jti,
        familyId: decoded.familyId,
      };
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

  signRefreshToken(params: { userId: number; jti: string; familyId: string }): string {
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

  sha256(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
  }
}
