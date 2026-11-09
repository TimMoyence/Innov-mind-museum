import bcrypt from 'bcrypt';

import { AppError, invalidInput, unauthorized } from '@shared/errors/app.error';
import { env } from '@src/config/env';

import { checkLoginRateLimit, recordFailedLogin, clearLoginAttempts } from './login-rate-limiter';
import { SessionIssuerService } from './session-issuer.service';
import { TokenJwtService } from './token-jwt.service';

import type { AuthSessionResponse, SafeUser } from './session-issuer.service';
import type { IRefreshTokenRepository } from '@modules/auth/domain/refresh-token/refresh-token.repository.interface';
import type { IAccessTokenDenylist } from '@modules/auth/domain/session/access-token-denylist.port';
import type { UserRole } from '@modules/auth/domain/user/user-role';
import type { User } from '@modules/auth/domain/user/user.entity';
import type { IUserRepository } from '@modules/auth/domain/user/user.repository.interface';

export type { AuthSessionResponse, SafeUser } from './session-issuer.service';

const sanitizeUser = (user: User): SafeUser => {
  return {
    id: user.id,
    email: user.email,
    firstname: user.firstname ?? null,
    lastname: user.lastname ?? null,
    role: user.role,
    museumId: user.museumId ?? null,
    onboardingCompleted: user.onboarding_completed,
  };
};

export class AuthSessionService {
  private readonly tokenJwt: TokenJwtService;
  private readonly sessionIssuer: SessionIssuerService;
  private accessTokenDenylist?: IAccessTokenDenylist;

  constructor(
    private readonly userRepository: IUserRepository,
    private readonly refreshTokenRepository: IRefreshTokenRepository,
    accessTokenDenylist?: IAccessTokenDenylist,
  ) {
    this.tokenJwt = new TokenJwtService();
    this.sessionIssuer = new SessionIssuerService(
      refreshTokenRepository,
      this.tokenJwt,
      env.auth.refreshIdleWindowSeconds,
    );
    if (accessTokenDenylist) this.accessTokenDenylist = accessTokenDenylist;
  }

  setAccessTokenDenylist(denylist: IAccessTokenDenylist): void {
    this.accessTokenDenylist = denylist;
  }

  async login(email: string, password: string): Promise<AuthSessionResponse> {
    if (!email.trim() || !password) {
      throw invalidInput('email and password are required');
    }

    const normalizedEmail = email.trim().toLowerCase();
    checkLoginRateLimit(normalizedEmail);

    const user = await this.userRepository.getUserByEmail(normalizedEmail);
    if (!user) {
      recordFailedLogin(normalizedEmail);
      throw unauthorized('Invalid credentials', 'INVALID_CREDENTIALS');
    }

    if (!user.password) {
      throw unauthorized('Invalid credentials', 'INVALID_CREDENTIALS');
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      recordFailedLogin(normalizedEmail);
      throw unauthorized('Invalid credentials', 'INVALID_CREDENTIALS');
    }

    if (user.deletedAt) {
      clearLoginAttempts(normalizedEmail);
      throw new AppError({
        message: 'Account deleted',
        statusCode: 403,
        code: 'ACCOUNT_DELETED',
      });
    }

    if (user.suspended) {
      clearLoginAttempts(normalizedEmail);
      throw new AppError({
        message: 'Account suspended. Contact support to restore access.',
        statusCode: 403,
        code: 'ACCOUNT_SUSPENDED',
      });
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

    const session = await this.sessionIssuer.issueSession({ user: sanitizeUser(user) });
    this.refreshTokenRepository.deleteExpiredTokens().catch(() => undefined);
    return session;
  }

  async refresh(refreshToken: string): Promise<AuthSessionResponse> {
    const token = refreshToken.trim();
    if (!token) {
      throw invalidInput('refreshToken is required');
    }

    const claims = this.tokenJwt.verifyRefreshToken(token);
    const stored = await this.refreshTokenRepository.findByJti(claims.jti);
    if (!stored) {
      throw unauthorized('Invalid refresh token', 'INVALID_REFRESH_TOKEN');
    }

    await this.sessionIssuer.assertRefreshTokenUsable(stored, token);

    const user = await this.userRepository.getUserById(Number(claims.sub));
    if (!user) {
      await this.refreshTokenRepository.revokeFamily(stored.familyId);
      throw unauthorized('User not found', 'INVALID_REFRESH_TOKEN');
    }

    if (user.deletedAt) {
      await this.refreshTokenRepository.revokeFamily(stored.familyId);
      throw unauthorized('Account deleted', 'ACCOUNT_DELETED');
    }
    if (user.suspended) {
      throw unauthorized('Account suspended', 'ACCOUNT_SUSPENDED');
    }

    return await this.sessionIssuer.issueSession({
      user: sanitizeUser(user),
      familyId: stored.familyId,
      rotateFrom: stored,
    });
  }

  async logout(
    refreshToken: string | undefined,
    ctx?: { accessJti: string; accessExpSec: number },
  ): Promise<void> {
    const token = refreshToken?.trim();
    if (token) {
      try {
        const claims = this.tokenJwt.verifyRefreshToken(token);
        await this.refreshTokenRepository.revokeByJti(claims.jti);
      } catch {}
    }

    if (ctx && this.accessTokenDenylist) {
      const ttlSec = ctx.accessExpSec - Math.floor(Date.now() / 1000);
      if (ttlSec > 0) {
        try {
          await this.accessTokenDenylist.add(ctx.accessJti, ttlSec);
        } catch {}
      }
    }
  }

  async socialLogin(user: User): Promise<AuthSessionResponse> {
    const session = await this.sessionIssuer.issueSession({
      user: sanitizeUser(user),
    });
    this.refreshTokenRepository.deleteExpiredTokens().catch(() => undefined);
    return session;
  }

  verifyAccessToken(token: string): { id: number; role: UserRole; museumId?: number | null } {
    return this.tokenJwt.verifyAccessToken(token);
  }

  verifyAccessTokenWithClaims(token: string): {
    id: number;
    role: UserRole;
    museumId?: number | null;
    jti: string;
    expSec: number;
  } {
    return this.tokenJwt.verifyAccessTokenWithClaims(token);
  }
}
