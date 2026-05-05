import crypto from 'node:crypto';

import { AppError } from '@shared/errors/app.error';

import type { TokenJwtService } from './token-jwt.service';
import type {
  IRefreshTokenRepository,
  StoredRefreshTokenRow,
} from '@modules/auth/domain/refresh-token/refresh-token.repository.interface';
import type { UserRole } from '@modules/auth/domain/user/user-role';

/** PII-safe projection of `User` returned to the client in auth envelopes. */
export interface SafeUser {
  id: number;
  email: string;
  firstname?: string | null;
  lastname?: string | null;
  role: UserRole;
  museumId?: number | null;
  onboardingCompleted: boolean;
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

const unauthorized = (message: string, code = 'UNAUTHORIZED'): AppError => {
  return new AppError({
    message,
    statusCode: 401,
    code,
  });
};

/**
 * Owns the refresh-token rotation contract: issue a fresh JWT pair (with
 * persistence + sliding-window anchor) and reject reuse / expiry / idle-timeout
 * before any new pair is emitted. Banking-grade — co-pinned with
 * `refresh-token.repository.pg.ts` as a Stryker hot file.
 */
export class SessionIssuerService {
  /**
   * Sliding-window threshold (ms). When the elapsed time since the previous
   * rotation on the session chain exceeds this value, the next refresh attempt
   * is rejected and the family revoked.
   */
  private readonly refreshIdleWindowMs: number;

  constructor(
    private readonly refreshTokenRepository: IRefreshTokenRepository,
    private readonly tokenJwt: TokenJwtService,
    refreshIdleWindowSeconds: number,
  ) {
    this.refreshIdleWindowMs = refreshIdleWindowSeconds * 1000;
  }

  /**
   * Issue a fresh `(accessToken, refreshToken)` pair, persist the refresh row
   * (insert for first issue, rotate when `rotateFrom` is set), and return the
   * envelope consumed by the auth route handlers.
   */
  async issueSession(params: {
    user: SafeUser;
    familyId?: string;
    rotateFrom?: StoredRefreshTokenRow;
    mfaWarningDaysRemaining?: number;
  }): Promise<AuthSessionResponse> {
    const accessJti = crypto.randomUUID();
    const refreshJti = crypto.randomUUID();
    const familyId = params.familyId ?? crypto.randomUUID();
    const issuedAt = new Date();
    const refreshExpiresAt = new Date(Date.now() + this.tokenJwt.refreshTtlSeconds * 1000);

    const accessToken = this.tokenJwt.signAccessToken({
      userId: params.user.id,
      role: params.user.role,
      museumId: params.user.museumId,
      jti: accessJti,
    });

    const refreshToken = this.tokenJwt.signRefreshToken({
      userId: params.user.id,
      jti: refreshJti,
      familyId,
    });

    const nextTokenRow = {
      userId: params.user.id,
      jti: refreshJti,
      familyId,
      tokenHash: this.tokenJwt.sha256(refreshToken),
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
      expiresIn: this.tokenJwt.accessTtlSeconds,
      refreshExpiresIn: this.tokenJwt.refreshTtlSeconds,
      user: params.user,
    };
    if (params.mfaWarningDaysRemaining !== undefined) {
      response.mfaWarningDaysRemaining = params.mfaWarningDaysRemaining;
    }
    return response;
  }

  /**
   * Enforce the rotation contract on a stored refresh-token row before issuing
   * the next pair. Throws 401 with a precise code on any policy violation;
   * revokes the family on reuse / replay / idle-timeout to break the chain.
   */
  async assertRefreshTokenUsable(
    stored: StoredRefreshTokenRow,
    providedToken: string,
  ): Promise<void> {
    const providedHash = this.tokenJwt.sha256(providedToken);
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
}
