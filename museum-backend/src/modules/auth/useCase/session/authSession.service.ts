import crypto from 'node:crypto';

import bcrypt from 'bcrypt';
import jwt, { type JwtPayload } from 'jsonwebtoken';

import { issueMfaSessionToken } from '@modules/auth/useCase/totp/mfaSessionToken';
import { AppError, badRequest } from '@shared/errors/app.error';
import { env } from '@src/config/env';

import { checkLoginRateLimit, recordFailedLogin, clearLoginAttempts } from './login-rate-limiter';

import type {
  IRefreshTokenRepository,
  StoredRefreshTokenRow,
} from '@modules/auth/domain/refresh-token/refresh-token.repository.interface';
import type { ITotpSecretRepository } from '@modules/auth/domain/totp/totp-secret.repository.interface';
import type { UserRole } from '@modules/auth/domain/user/user-role';
import type { User } from '@modules/auth/domain/user/user.entity';
import type { IUserRepository } from '@modules/auth/domain/user/user.repository.interface';

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
  /**
   * R16 — when an admin is inside the MFA warning window, the login response
   * carries the number of days remaining so the frontend can render a
   * persistent banner. Absent (undefined) when:
   *   - the user is not an admin, or
   *   - the user is already enrolled, or
   *   - MFA is already enforced (response shape becomes `MfaRequiredResponse`).
   */
  mfaWarningDaysRemaining?: number;
}

/**
 * Returned instead of {@link AuthSessionResponse} when an enrolled admin
 * supplies a valid password but still owes the second factor. The frontend
 * MUST exchange `mfaSessionToken` for a real JWT pair via `/auth/mfa/challenge`
 * (TOTP code) or `/auth/mfa/recovery` (recovery code).
 */
export interface MfaRequiredResponse {
  mfaRequired: true;
  /** Short-lived bearer (5 min) — opaque to the client beyond round-tripping. */
  mfaSessionToken: string;
  /** TTL of `mfaSessionToken` in seconds — drives countdown UI. */
  mfaSessionExpiresIn: number;
}

/**
 * Returned when an admin's MFA warning deadline has elapsed without
 * enrollment. The frontend redirects to `/admin/mfa` (or the equivalent RN
 * screen) which calls `/auth/mfa/enroll` directly. Until enrollment + verify
 * complete, no JWTs are issued.
 */
export interface MfaEnrollmentRequiredResponse {
  mfaEnrollmentRequired: true;
  /** Hint URL — frontend can hard-code its own routing instead. */
  redirectTo: string;
}

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
  /**
   * Sliding-window threshold (ms). Sourced from `env.auth.refreshIdleWindowSeconds`.
   * When the elapsed time since the previous rotation on the session chain exceeds
   * this value, the next refresh attempt is rejected and the family revoked.
   */
  private readonly refreshIdleWindowMs = env.auth.refreshIdleWindowSeconds * 1000;

  /**
   * `totpRepository` is optional so legacy unit tests that already construct
   * `new AuthSessionService(userRepo, refreshRepo)` keep compiling. When
   * absent, MFA is treated as not-enrolled for every user — fine in tests
   * because they never assert on the MFA branch.
   */
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly refreshTokenRepository: IRefreshTokenRepository,
    private readonly totpRepository?: ITotpSecretRepository,
  ) {}

  /**
   * Authenticate a user with email/password and issue a token pair (or an
   * MFA challenge / enrollment-required envelope when applicable).
   *
   * Response shapes (R16):
   *   - `AuthSessionResponse` — happy path. May carry
   *     `mfaWarningDaysRemaining` when the caller is an admin still inside
   *     the 30-day enrollment warning window.
   *   - `MfaRequiredResponse` — admin enrolled; password verified; second
   *     factor required via `/auth/mfa/challenge`.
   *   - `MfaEnrollmentRequiredResponse` — admin past the warning deadline
   *     without enrolling; no JWTs issued, frontend must redirect to enroll.
   *
   * @param email - The user's email.
   * @param password - The user's plain-text password.
   * @returns A typed login envelope (see {@link LoginResponse}).
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

    // F6 (2026-04-30, ADR-013) — MFA enforced for any user with an active TOTP
    // enrollment, regardless of role. Once a user opts in, every login must
    // complete the second factor. Non-enrolled non-admins remain unaffected
    // (opt-in stays opt-in); admins additionally inherit the warning-window
    // enrollment policy from R16.
    const mfaOutcome = await this.evaluateMfaGate(user);
    if (mfaOutcome) {
      // Schedule background cleanup but don't block on it.
      this.refreshTokenRepository.deleteExpiredTokens().catch(() => {
        /* noop */
      });
      return mfaOutcome;
    }

    const session = await this.issueSession({
      user: sanitizeUser(user),
      mfaWarningDaysRemaining: this.computeWarningDays(user),
    });
    this.refreshTokenRepository.deleteExpiredTokens().catch(() => {
      /* noop */
    });
    return session;
  }

  /**
   * Issue a fresh JWT pair for a user that has just satisfied a second factor
   * (TOTP code or recovery code). Public surface used by `challengeMfa` and
   * `recoveryMfa` use cases — they cannot reach the private `issueSession()`.
   */
  async issueSessionForUser(user: User): Promise<AuthSessionResponse> {
    return await this.issueSession({
      user: sanitizeUser(user),
    });
  }

  /**
   * F6 (2026-04-30, renamed from `evaluateAdminMfaGate`) — Evaluate MFA policy
   * for any user. Two coupled rules:
   *
   *   1. Any user with an `enrolledAt` TOTP row gates on the second factor,
   *      regardless of role (the F6 fix — was admin-only pre-2026-04-30).
   *   2. Admins additionally inherit the R16 warning-window enrollment policy:
   *      first observed login stamps `mfaEnrollmentDeadline = now + warningDays`,
   *      and once that deadline passes, login is soft-blocked with
   *      `MfaEnrollmentRequiredResponse` until they enroll.
   *
   * Returns:
   *   - `MfaRequiredResponse` — caller must finish the second factor.
   *   - `MfaEnrollmentRequiredResponse` — admin only, past the deadline.
   *   - `null` — proceed to issue full JWTs.
   *
   * F9 (2026-04-30 — partial) — Pre-F6 the divergent envelope shapes leaked
   * the enrolled-vs-unenrolled status of admin accounts, enabling enumeration
   * of which admin emails had MFA. Post-F6 the oracle is materially reduced:
   *
   *   - Non-admin roles always return `null` or `mfaRequired:true` —
   *     observationally indistinguishable.
   *   - Admins still produce three distinct shapes (mfaRequired / mfaEnrollment
   *     Required / null) when probed across enrollment + deadline states.
   *     Closing that residual oracle requires migrating to a uniform
   *     `mfaRequired` envelope plus a follow-up `/api/auth/mfa/status` call —
   *     tracked as a separate refactor (Phase 2 of the hardening sweep).
   */
  private async evaluateMfaGate(
    user: User,
  ): Promise<MfaRequiredResponse | MfaEnrollmentRequiredResponse | null> {
    const totpRow = await this.totpRepository?.findByUserId(user.id);
    const enrolled = totpRow?.enrolledAt != null;

    if (enrolled) {
      return {
        mfaRequired: true,
        mfaSessionToken: issueMfaSessionToken(user.id),
        mfaSessionExpiresIn: env.auth.mfaSessionTokenTtlSeconds,
      };
    }

    // Non-enrolled: only admins are subject to the enrollment-deadline policy.
    // Other roles keep MFA opt-in — no warning, no soft-block.
    if (user.role !== 'admin') {
      return null;
    }

    const now = Date.now();
    let deadline = user.mfaEnrollmentDeadline ?? null;
    if (!deadline) {
      // First admin login post-deploy → anchor the deadline NOW.
      const warningMs = env.auth.mfaEnrollmentWarningDays * 24 * 60 * 60 * 1000;
      deadline = new Date(now + warningMs);
      await this.userRepository.setMfaEnrollmentDeadline(user.id, deadline);
      // Mutate the in-memory copy so the caller's downstream computations
      // (warning days remaining) read consistently.
      user.mfaEnrollmentDeadline = deadline;
    }

    if (now >= deadline.getTime()) {
      return {
        mfaEnrollmentRequired: true,
        redirectTo: '/auth/mfa/enroll',
      };
    }

    // Inside warning window: caller goes through the happy path with a
    // banner driver attached.
    return null;
  }

  /** Days-remaining helper for the warning banner. Returns `undefined` when N/A. */
  private computeWarningDays(user: User): number | undefined {
    if (user.role !== 'admin') return undefined;
    const deadline = user.mfaEnrollmentDeadline;
    if (!deadline) return undefined;
    const ms = deadline.getTime() - Date.now();
    if (ms <= 0) return 0;
    return Math.ceil(ms / (24 * 60 * 60 * 1000));
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

    // Sliding idle window — if no rotation activity happened within the
    // configured threshold, force re-auth. Fallback anchor for legacy rows
    // predating the `last_rotated_at` column: createdAt (non-null by schema).
    const idleAnchor = stored.lastRotatedAt ?? stored.createdAt;
    const idleMs = Date.now() - idleAnchor.getTime();
    if (idleMs > this.refreshIdleWindowMs) {
      await this.refreshTokenRepository.revokeFamily(stored.familyId);
      throw unauthorized('Session idle timeout', 'SESSION_IDLE_TIMEOUT');
    }
  }

  private async issueSession(params: {
    user: SafeUser;
    familyId?: string;
    rotateFrom?: StoredRefreshTokenRow;
    mfaWarningDaysRemaining?: number;
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
      // Stamp the sliding-window anchor at rotation / issue time.
      lastRotatedAt: issuedAt,
    };

    await (params.rotateFrom
      ? this.refreshTokenRepository.rotate({
          currentTokenId: params.rotateFrom.id,
          next: nextTokenRow,
        })
      : this.refreshTokenRepository.insert(nextTokenRow));

    const response: AuthSessionResponse = {
      accessToken,
      refreshToken,
      expiresIn: this.accessTtlSeconds,
      refreshExpiresIn: this.refreshTtlSeconds,
      user: params.user,
    };
    if (params.mfaWarningDaysRemaining !== undefined) {
      response.mfaWarningDaysRemaining = params.mfaWarningDaysRemaining;
    }
    return response;
  }
}
