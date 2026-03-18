import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt, { JwtPayload } from 'jsonwebtoken';

import { env } from '@src/config/env';
import { AppError, badRequest } from '@shared/errors/app.error';
import { UserRepositoryPg } from '@modules/auth/adapters/secondary/user.repository.pg';
import {
  RefreshTokenRepositoryPg,
  StoredRefreshTokenRow,
} from '@modules/auth/adapters/secondary/refresh-token.repository.pg';

interface SafeUser {
  id: number;
  email: string;
  firstname?: string | null;
  lastname?: string | null;
}

interface AccessTokenClaims extends JwtPayload {
  sub: string;
  email: string;
  firstname?: string | null;
  lastname?: string | null;
  type: 'access';
  jti: string;
}

interface RefreshTokenClaims extends JwtPayload {
  sub: string;
  type: 'refresh';
  jti: string;
  familyId: string;
}

/** Token pair and user info returned after successful authentication. */
export interface AuthSessionResponse {
  accessToken: string;
  refreshToken: string;
  /** Access token lifetime in seconds. */
  expiresIn: number;
  /** Refresh token lifetime in seconds. */
  refreshExpiresIn: number;
  user: SafeUser;
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

  const match = raw.match(/^(\d+)\s*([smhd])$/i);
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

const sha256 = (value: string): string => {
  return crypto.createHash('sha256').update(value).digest('hex');
};

const sanitizeUser = (user: Record<string, unknown>): SafeUser => {
  return {
    id: Number(user.id),
    email: String(user.email),
    firstname:
      typeof user.firstname === 'string' || user.firstname === null
        ? (user.firstname as string | null)
        : null,
    lastname:
      typeof user.lastname === 'string' || user.lastname === null
        ? (user.lastname as string | null)
        : null,
  };
};

/** Orchestrates authentication sessions: login, token refresh, logout, and access-token verification. */
export class AuthSessionService {
  private readonly accessTtlSeconds = ttlToSeconds(env.auth.accessTokenTtl);
  private readonly refreshTtlSeconds = ttlToSeconds(env.auth.refreshTokenTtl);

  constructor(
    private readonly userRepository = new UserRepositoryPg(),
    private readonly refreshTokenRepository = new RefreshTokenRepositoryPg(),
  ) {}

  /**
   * Authenticate a user with email/password and issue a token pair.
   * @param email - The user's email.
   * @param password - The user's plain-text password.
   * @returns Access/refresh tokens and user info.
   * @throws {AppError} 400 if fields are missing, 401 if credentials are invalid or account is social-only.
   */
  async login(email: string, password: string): Promise<AuthSessionResponse> {
    if (!email?.trim() || !password) {
      throw badRequest('email and password are required');
    }

    const user = await this.userRepository.getUserByEmail(email.trim());
    if (!user) {
      throw unauthorized('Invalid credentials', 'INVALID_CREDENTIALS');
    }

    if (!user.password) {
      throw unauthorized(
        'This account uses social sign-in. Please use Apple or Google to log in.',
        'SOCIAL_ACCOUNT',
      );
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      throw unauthorized('Invalid credentials', 'INVALID_CREDENTIALS');
    }

    const session = await this.issueSession({
      user: sanitizeUser(user as unknown as Record<string, unknown>),
    });
    this.refreshTokenRepository.deleteExpiredTokens().catch(() => {});
    return session;
  }

  /**
   * Rotate a refresh token and issue a new token pair.
   * Revokes the entire token family if reuse is detected.
   * @param refreshToken - The current refresh JWT.
   * @returns A new access/refresh token pair.
   * @throws {AppError} 400 if token is missing, 401 if token is invalid/expired/reused.
   */
  async refresh(refreshToken: string): Promise<AuthSessionResponse> {
    const token = refreshToken?.trim();
    if (!token) {
      throw badRequest('refreshToken is required');
    }

    const claims = this.verifyRefreshToken(token);
    const stored = await this.refreshTokenRepository.findByJti(claims.jti);
    if (!stored) {
      throw unauthorized('Invalid refresh token', 'INVALID_REFRESH_TOKEN');
    }

    await this.assertRefreshTokenUsable(stored, token);

    const user = await this.userRepository.getUserById(Number(claims.sub));
    if (!user) {
      await this.refreshTokenRepository.revokeFamily(stored.familyId);
      throw unauthorized('User not found', 'INVALID_REFRESH_TOKEN');
    }

    return this.issueSession({
      user: sanitizeUser(user as unknown as Record<string, unknown>),
      familyId: stored.familyId,
      rotateFrom: stored,
    });
  }

  /**
   * Revoke a refresh token on logout. Idempotent — silently ignores invalid tokens.
   * @param refreshToken - The refresh JWT to revoke, or `undefined`.
   */
  async logout(refreshToken: string | undefined): Promise<void> {
    const token = refreshToken?.trim();
    if (!token) {
      return;
    }

    try {
      const claims = this.verifyRefreshToken(token);
      await this.refreshTokenRepository.revokeByJti(claims.jti);
    } catch {
      // Logout is idempotent and should not leak token validation details.
    }
  }

  /**
   * Issue a session for a user authenticated via social sign-in.
   * @param user - Raw user record (sanitized internally).
   * @returns Access/refresh tokens and user info.
   */
  async socialLogin(user: Record<string, unknown>): Promise<AuthSessionResponse> {
    const session = await this.issueSession({
      user: sanitizeUser(user),
    });
    this.refreshTokenRepository.deleteExpiredTokens().catch(() => {});
    return session;
  }

  /**
   * Verify and decode an access token.
   * @param token - The raw JWT access token.
   * @returns The authenticated user's safe profile.
   * @throws {AppError} 401 if the token is invalid or expired.
   */
  verifyAccessToken(token: string): SafeUser {
    try {
      const decoded = jwt.verify(token, env.auth.accessTokenSecret) as AccessTokenClaims;
      if (decoded.type !== 'access' || !decoded.sub || !decoded.email) {
        throw unauthorized('Invalid access token', 'INVALID_ACCESS_TOKEN');
      }

      return {
        id: Number(decoded.sub),
        email: decoded.email,
        firstname: decoded.firstname ?? null,
        lastname: decoded.lastname ?? null,
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      throw unauthorized('Invalid access token', 'INVALID_ACCESS_TOKEN');
    }
  }

  private verifyRefreshToken(token: string): RefreshTokenClaims {
    try {
      const decoded = jwt.verify(token, env.auth.refreshTokenSecret) as RefreshTokenClaims;
      if (
        decoded.type !== 'refresh' ||
        typeof decoded.sub !== 'string' ||
        typeof decoded.jti !== 'string' ||
        typeof decoded.familyId !== 'string'
      ) {
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

  private async assertRefreshTokenUsable(
    stored: StoredRefreshTokenRow,
    providedToken: string,
  ): Promise<void> {
    const providedHash = sha256(providedToken);
    if (stored.tokenHash !== providedHash) {
      await this.refreshTokenRepository.revokeFamily(stored.familyId, true);
      throw unauthorized('Refresh token reuse detected', 'REFRESH_TOKEN_REUSE_DETECTED');
    }

    if (stored.revokedAt || stored.rotatedAt || stored.reuseDetectedAt) {
      await this.refreshTokenRepository.revokeFamily(stored.familyId, true);
      throw unauthorized('Refresh token reuse detected', 'REFRESH_TOKEN_REUSE_DETECTED');
    }

    if (stored.expiresAt.getTime() <= Date.now()) {
      await this.refreshTokenRepository.revokeByJti(stored.jti);
      throw unauthorized('Refresh token expired', 'REFRESH_TOKEN_EXPIRED');
    }
  }

  private async issueSession(params: {
    user: SafeUser;
    familyId?: string;
    rotateFrom?: StoredRefreshTokenRow;
  }): Promise<AuthSessionResponse> {
    const accessJti = crypto.randomUUID();
    const refreshJti = crypto.randomUUID();
    const familyId = params.familyId || crypto.randomUUID();
    const issuedAt = new Date();
    const refreshExpiresAt = new Date(Date.now() + this.refreshTtlSeconds * 1000);

    const accessToken = jwt.sign(
      {
        sub: String(params.user.id),
        email: params.user.email,
        firstname: params.user.firstname ?? null,
        lastname: params.user.lastname ?? null,
        type: 'access',
        jti: accessJti,
      },
      env.auth.accessTokenSecret,
      { expiresIn: env.auth.accessTokenTtl as jwt.SignOptions['expiresIn'] },
    );

    const refreshToken = jwt.sign(
      {
        sub: String(params.user.id),
        type: 'refresh',
        jti: refreshJti,
        familyId,
      },
      env.auth.refreshTokenSecret,
      { expiresIn: env.auth.refreshTokenTtl as jwt.SignOptions['expiresIn'] },
    );

    const nextTokenRow = {
      userId: params.user.id,
      jti: refreshJti,
      familyId,
      tokenHash: sha256(refreshToken),
      issuedAt,
      expiresAt: refreshExpiresAt,
    };

    if (params.rotateFrom) {
      await this.refreshTokenRepository.rotate({
        currentTokenId: params.rotateFrom.id,
        next: nextTokenRow,
      });
    } else {
      await this.refreshTokenRepository.insert(nextTokenRow);
    }

    return {
      accessToken,
      refreshToken,
      expiresIn: this.accessTtlSeconds,
      refreshExpiresIn: this.refreshTtlSeconds,
      user: params.user,
    };
  }
}
