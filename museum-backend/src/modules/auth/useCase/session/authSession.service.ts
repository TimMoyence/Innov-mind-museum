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
      /** Deliberately generic to avoid revealing whether an account exists or uses social sign-in. */
      throw unauthorized('Invalid credentials', 'INVALID_CREDENTIALS');
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      recordFailedLogin(normalizedEmail);
      throw unauthorized('Invalid credentials', 'INVALID_CREDENTIALS');
    }

    // Suspension/soft-delete BEFORE email_verified so operator signal takes
    // precedence over verification banner. ADR-052.
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
    this.refreshTokenRepository.deleteExpiredTokens().catch(() => {
      /* noop */
    });
    return session;
  }

  /**
   * Rotates token, revokes family on reuse detection.
   *
   * @throws {AppError} 400 missing, 401 invalid/expired/reused.
   */
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

    // ADR-052 — family revoked on delete (no recovery path), kept on suspend
    // so unsuspending restores the session pair without a full re-login.
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

  /**
   * Idempotent — silently ignores invalid tokens.
   *
   * R7 — accepts an optional `ctx` with the access-token `jti` + `exp` so the
   * denylist gets the access side too (refresh revocation alone leaves the
   * access JWT cryptographically valid up to its natural TTL ≤ 15 min). The
   * route handler is responsible for extracting + verifying the bearer access
   * token BEFORE passing it here ; this service trusts the ctx fields.
   *
   * `ttlSec <= 0` (access token already expired) is a no-op on the denylist
   * side — the adapter skips the Redis write. Both effects are silent on
   * invalid input (logout MUST stay idempotent for FE-side reliability).
   */
  async logout(
    refreshToken: string | undefined,
    ctx?: { accessJti: string; accessExpSec: number },
  ): Promise<void> {
    const token = refreshToken?.trim();
    if (token) {
      try {
        const claims = this.tokenJwt.verifyRefreshToken(token);
        await this.refreshTokenRepository.revokeByJti(claims.jti);
      } catch {
        // Idempotent — must not leak token validation details.
      }
    }

    if (ctx && this.accessTokenDenylist) {
      const ttlSec = ctx.accessExpSec - Math.floor(Date.now() / 1000);
      if (ttlSec > 0) {
        try {
          await this.accessTokenDenylist.add(ctx.accessJti, ttlSec);
        } catch {
          // Adapter contract is fail-OPEN (R9) — should never throw here, but
          // belt-and-braces : an unexpected throw must not break logout.
        }
      }
    }
  }

  async socialLogin(user: User): Promise<AuthSessionResponse> {
    const session = await this.sessionIssuer.issueSession({
      user: sanitizeUser(user),
    });
    this.refreshTokenRepository.deleteExpiredTokens().catch(() => {
      /* noop */
    });
    return session;
  }

  /** @throws {AppError} 401 if token invalid or expired. */
  verifyAccessToken(token: string): { id: number; role: UserRole; museumId?: number | null } {
    return this.tokenJwt.verifyAccessToken(token);
  }

  /**
   * R8 — same as {@link verifyAccessToken} but exposes the `jti` + `exp` claims.
   * Used by the denylist middleware (consults `denylist.has(jti)`) and the
   * logout route handler (writes `denylist.add(jti, ttl)` after server-side
   * verification of the bearer).
   *
   * @throws {AppError} 401 INVALID_ACCESS_TOKEN.
   */
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
