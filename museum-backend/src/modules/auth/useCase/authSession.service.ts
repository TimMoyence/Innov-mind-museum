import crypto from 'node:crypto';

import bcrypt from 'bcrypt';
import jwt, { type JwtPayload } from 'jsonwebtoken';

import { AppError, badRequest } from '@shared/errors/app.error';
import { env } from '@src/config/env';

import { checkLoginRateLimit, recordFailedLogin, clearLoginAttempts } from './login-rate-limiter';

import type {
  IRefreshTokenRepository,
  StoredRefreshTokenRow,
} from '../domain/refresh-token.repository.interface';
import type { UserRole } from '../domain/user-role';
import type { User } from '../domain/user.entity';
import type { IUserRepository } from '../domain/user.repository.interface';

interface SafeUser {
  id: number;
  email: string;
  firstname?: string | null;
  lastname?: string | null;
  role: UserRole;
  museumId?: number | null;
  onboardingCompleted: boolean;
}

interface AccessTokenClaims extends JwtPayload {
  sub: string;
  type: 'access';
  jti: string;
  role?: UserRole;
  museumId?: number | null;
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

const sha256 = (value: string): string => {
  return crypto.createHash('sha256').update(value).digest('hex');
};

const resolveMuseumId = (user: User): number | null => {
  return user.museumId ?? null;
};

const sanitizeUser = (user: User): SafeUser => {
  return {
    id: user.id,
    email: user.email,
    firstname: user.firstname ?? null,
    lastname: user.lastname ?? null,
    role: user.role,
    museumId: resolveMuseumId(user),
    onboardingCompleted: user.onboarding_completed,
  };
};

/** Orchestrates authentication sessions: login, token refresh, logout, and access-token verification. */
export class AuthSessionService {
  private readonly accessTtlSeconds = ttlToSeconds(env.auth.accessTokenTtl);
  private readonly refreshTtlSeconds = ttlToSeconds(env.auth.refreshTokenTtl);

  constructor(
    private readonly userRepository: IUserRepository,
    private readonly refreshTokenRepository: IRefreshTokenRepository,
  ) {}

  /**
   * Authenticate a user with email/password and issue a token pair.
   *
   * @param email - The user's email.
   * @param password - The user's plain-text password.
   * @returns Access/refresh tokens and user info.
   * @throws {AppError} 400 if fields are missing, 401 if credentials are invalid or account is social-only.
   */
  async login(email: string, password: string): Promise<AuthSessionResponse> {
    if (!email.trim() || !password) {
      throw badRequest('email and password are required');
    }

    const normalizedEmail = email.trim().toLowerCase();
    checkLoginRateLimit(normalizedEmail);

    const user = await this.userRepository.getUserByEmail(normalizedEmail);
    if (!user) {
      recordFailedLogin(normalizedEmail);
      throw unauthorized('Invalid credentials', 'INVALID_CREDENTIALS');
    }

    if (!user.password) {
      /** Deliberately generic to avoid revealing whether an account exists or uses social sign-in. */
      throw unauthorized('Invalid credentials', 'INVALID_CREDENTIALS');
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      recordFailedLogin(normalizedEmail);
      throw unauthorized('Invalid credentials', 'INVALID_CREDENTIALS');
    }

    if (!user.email_verified) {
      clearLoginAttempts(normalizedEmail);
      throw new AppError({
        message:
          'Email not verified. Check your inbox for the verification link, or request a new one.',
        statusCode: 403,
        code: 'EMAIL_NOT_VERIFIED',
      });
    }

    clearLoginAttempts(normalizedEmail);

    const session = await this.issueSession({
      user: sanitizeUser(user),
    });
    this.refreshTokenRepository.deleteExpiredTokens().catch(() => {
      /* noop */
    });
    return session;
  }

  /**
   * Rotate a refresh token and issue a new token pair.
   * Revokes the entire token family if reuse is detected.
   *
   * @param refreshToken - The current refresh JWT.
   * @returns A new access/refresh token pair.
   * @throws {AppError} 400 if token is missing, 401 if token is invalid/expired/reused.
   */
  async refresh(refreshToken: string): Promise<AuthSessionResponse> {
    const token = refreshToken.trim();
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

    return await this.issueSession({
      user: sanitizeUser(user),
      familyId: stored.familyId,
      rotateFrom: stored,
    });
  }

  /**
   * Revoke a refresh token on logout. Idempotent — silently ignores invalid tokens.
   *
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
   *
   * @param user - User entity (sanitized internally).
   * @returns Access/refresh tokens and user info.
   */
  async socialLogin(user: User): Promise<AuthSessionResponse> {
    const session = await this.issueSession({
      user: sanitizeUser(user),
    });
    this.refreshTokenRepository.deleteExpiredTokens().catch(() => {
      /* noop */
    });
    return session;
  }

  /**
   * Verify and decode an access token.
   *
   * @param token - The raw JWT access token.
   * @returns The authenticated user's safe profile.
   * @throws {AppError} 401 if the token is invalid or expired.
   */
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

  private verifyRefreshToken(token: string): RefreshTokenClaims {
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
    const familyId = params.familyId ?? crypto.randomUUID();
    const issuedAt = new Date();
    const refreshExpiresAt = new Date(Date.now() + this.refreshTtlSeconds * 1000);

    const accessToken = jwt.sign(
      {
        sub: String(params.user.id),
        type: 'access',
        jti: accessJti,
        role: params.user.role,
        ...(params.user.museumId ? { museumId: params.user.museumId } : {}),
      },
      env.auth.accessTokenSecret,
      { algorithm: 'HS256', expiresIn: env.auth.accessTokenTtl as jwt.SignOptions['expiresIn'] },
    );

    const refreshToken = jwt.sign(
      {
        sub: String(params.user.id),
        type: 'refresh',
        jti: refreshJti,
        familyId,
      },
      env.auth.refreshTokenSecret,
      { algorithm: 'HS256', expiresIn: env.auth.refreshTokenTtl as jwt.SignOptions['expiresIn'] },
    );

    const nextTokenRow = {
      userId: params.user.id,
      jti: refreshJti,
      familyId,
      tokenHash: sha256(refreshToken),
      issuedAt,
      expiresAt: refreshExpiresAt,
    };

    await (params.rotateFrom
      ? this.refreshTokenRepository.rotate({
          currentTokenId: params.rotateFrom.id,
          next: nextTokenRow,
        })
      : this.refreshTokenRepository.insert(nextTokenRow));

    return {
      accessToken,
      refreshToken,
      expiresIn: this.accessTtlSeconds,
      refreshExpiresIn: this.refreshTtlSeconds,
      user: params.user,
    };
  }
}
