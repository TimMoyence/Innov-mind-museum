import bcrypt from 'bcrypt';

import { AppError, badRequest } from '@shared/errors/app.error';
import { env } from '@src/config/env';

import { checkLoginRateLimit, recordFailedLogin, clearLoginAttempts } from './login-rate-limiter';
import { MfaGateService } from './mfa-gate.service';
import { SessionIssuerService } from './session-issuer.service';
import { TokenJwtService } from './token-jwt.service';

import type { MfaEnrollmentRequiredResponse, MfaRequiredResponse } from './mfa-gate.service';
import type { AuthSessionResponse, SafeUser } from './session-issuer.service';
import type { IRefreshTokenRepository } from '@modules/auth/domain/refresh-token/refresh-token.repository.interface';
import type { IAccessTokenDenylist } from '@modules/auth/domain/session/access-token-denylist.port';
import type { ITotpSecretRepository } from '@modules/auth/domain/totp/totp-secret.repository.interface';
import type { UserRole } from '@modules/auth/domain/user/user-role';
import type { User } from '@modules/auth/domain/user/user.entity';
import type { IUserRepository } from '@modules/auth/domain/user/user.repository.interface';

// Re-export envelope types so existing import paths keep compiling.
export type { AuthSessionResponse, SafeUser } from './session-issuer.service';
export type { MfaEnrollmentRequiredResponse, MfaRequiredResponse } from './mfa-gate.service';

/** Discriminated union covering the three login success shapes. */
export type LoginResponse =
  | AuthSessionResponse
  | MfaRequiredResponse
  | MfaEnrollmentRequiredResponse;

const unauthorized = (message: string, code = 'UNAUTHORIZED'): AppError => {
  return new AppError({
    message,
    statusCode: 401,
    code,
  });
};

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

/**
 * Façade: login, refresh, logout, access-token verify. Delegates to:
 *   - `TokenJwtService`       — JWT sign/verify, TTL parsing, sha256 hashing.
 *   - `SessionIssuerService`  — refresh-token rotation contract + pair issuance.
 *   - `MfaGateService`        — admin warning-window + TOTP enrollment policy.
 */
export class AuthSessionService {
  private readonly tokenJwt: TokenJwtService;
  private readonly sessionIssuer: SessionIssuerService;
  private readonly mfaGate: MfaGateService;

  /**
   * `totpRepository` optional for legacy unit tests — absent means MFA not-enrolled.
   * `accessTokenDenylist` optional too — composition root wires the Redis or Noop
   * adapter (R7 design §3.1). Tests that don't exercise revocation can omit it.
   */
  /**
   * Composition root may wire the denylist post-construction via
   * {@link setAccessTokenDenylist} (the auth useCase singletons instantiate
   * BEFORE `index.ts::initCacheAndRateLimit` runs ; rather than ordering the
   * boot graph, we accept the late wiring). Tests inject directly via the
   * constructor's 4th arg.
   */
  private accessTokenDenylist?: IAccessTokenDenylist;

  constructor(
    private readonly userRepository: IUserRepository,
    private readonly refreshTokenRepository: IRefreshTokenRepository,
    totpRepository?: ITotpSecretRepository,
    accessTokenDenylist?: IAccessTokenDenylist,
  ) {
    this.tokenJwt = new TokenJwtService();
    this.sessionIssuer = new SessionIssuerService(
      refreshTokenRepository,
      this.tokenJwt,
      env.auth.refreshIdleWindowSeconds,
    );
    this.mfaGate = new MfaGateService(userRepository, totpRepository);
    if (accessTokenDenylist) this.accessTokenDenylist = accessTokenDenylist;
  }

  /** Composition-root setter — mirrors `setRedisRateLimitStore` / `setLlmCostCounter`. */
  setAccessTokenDenylist(denylist: IAccessTokenDenylist): void {
    this.accessTokenDenylist = denylist;
  }

  /** @throws {AppError} 400 missing fields, 401 invalid credentials, 403 email unverified/suspended/deleted. */
  async login(email: string, password: string): Promise<LoginResponse> {
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

    const mfaOutcome = await this.mfaGate.evaluateMfaGate(user);
    if (mfaOutcome) {
      this.refreshTokenRepository.deleteExpiredTokens().catch(() => {
        /* noop */
      });
      return mfaOutcome;
    }

    const session = await this.sessionIssuer.issueSession({
      user: sanitizeUser(user),
      mfaWarningDaysRemaining: this.mfaGate.computeWarningDays(user),
    });
    this.refreshTokenRepository.deleteExpiredTokens().catch(() => {
      /* noop */
    });
    return session;
  }

  /** Used by `challengeMfa` and `recoveryMfa` after second-factor success. */
  async issueSessionForUser(user: User): Promise<AuthSessionResponse> {
    return await this.sessionIssuer.issueSession({
      user: sanitizeUser(user),
    });
  }

  /**
   * Rotates token, revokes family on reuse detection.
   *
   * @throws {AppError} 400 missing, 401 invalid/expired/reused.
   */
  async refresh(refreshToken: string): Promise<AuthSessionResponse> {
    const token = refreshToken.trim();
    if (!token) {
      throw badRequest('refreshToken is required');
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
