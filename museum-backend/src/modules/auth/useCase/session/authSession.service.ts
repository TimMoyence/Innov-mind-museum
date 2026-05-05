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
import type { ITotpSecretRepository } from '@modules/auth/domain/totp/totp-secret.repository.interface';
import type { UserRole } from '@modules/auth/domain/user/user-role';
import type { User } from '@modules/auth/domain/user/user.entity';
import type { IUserRepository } from '@modules/auth/domain/user/user.repository.interface';

// Re-export the public envelope types so existing import paths
// (`@modules/auth/useCase/session/authSession.service`) keep compiling.
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
 * Façade orchestrating authentication sessions: login, token refresh, logout,
 * and access-token verification. Delegates concerns to three SRP siblings:
 *   - `TokenJwtService`       — JWT sign/verify, TTL parsing, sha256 hashing.
 *   - `SessionIssuerService`  — refresh-token rotation contract + pair issuance.
 *   - `MfaGateService`        — admin warning-window + TOTP enrollment policy.
 */
export class AuthSessionService {
  private readonly tokenJwt: TokenJwtService;
  private readonly sessionIssuer: SessionIssuerService;
  private readonly mfaGate: MfaGateService;

  /**
   * `totpRepository` is optional so legacy unit tests that already construct
   * `new AuthSessionService(userRepo, refreshRepo)` keep compiling. When
   * absent, MFA is treated as not-enrolled for every user — fine in tests
   * because they never assert on the MFA branch.
   */
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly refreshTokenRepository: IRefreshTokenRepository,
    totpRepository?: ITotpSecretRepository,
  ) {
    this.tokenJwt = new TokenJwtService();
    this.sessionIssuer = new SessionIssuerService(
      refreshTokenRepository,
      this.tokenJwt,
      env.auth.refreshIdleWindowSeconds,
    );
    this.mfaGate = new MfaGateService(userRepository, totpRepository);
  }

  /**
   * Authenticate a user with email/password and issue a token pair (or an
   * MFA challenge / enrollment-required envelope when applicable).
   *
   * @throws {AppError} 400 if fields are missing, 401 if credentials are invalid, 403 if email unverified.
   */
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

  /**
   * Issue a fresh JWT pair for a user that has just satisfied a second factor
   * (TOTP code or recovery code). Public surface used by `challengeMfa` and
   * `recoveryMfa` use cases.
   */
  async issueSessionForUser(user: User): Promise<AuthSessionResponse> {
    return await this.sessionIssuer.issueSession({
      user: sanitizeUser(user),
    });
  }

  /**
   * Rotate a refresh token and issue a new token pair.
   * Revokes the entire token family if reuse is detected.
   *
   * @throws {AppError} 400 if token is missing, 401 if token is invalid/expired/reused.
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

    return await this.sessionIssuer.issueSession({
      user: sanitizeUser(user),
      familyId: stored.familyId,
      rotateFrom: stored,
    });
  }

  /** Revoke a refresh token on logout. Idempotent — silently ignores invalid tokens. */
  async logout(refreshToken: string | undefined): Promise<void> {
    const token = refreshToken?.trim();
    if (!token) {
      return;
    }

    try {
      const claims = this.tokenJwt.verifyRefreshToken(token);
      await this.refreshTokenRepository.revokeByJti(claims.jti);
    } catch {
      // Logout is idempotent and should not leak token validation details.
    }
  }

  /** Issue a session for a user authenticated via social sign-in. */
  async socialLogin(user: User): Promise<AuthSessionResponse> {
    const session = await this.sessionIssuer.issueSession({
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
   * @throws {AppError} 401 if the token is invalid or expired.
   */
  verifyAccessToken(token: string): { id: number; role: UserRole; museumId?: number | null } {
    return this.tokenJwt.verifyAccessToken(token);
  }
}
