import crypto from 'node:crypto';

import { unauthorized } from '@shared/errors/app.error';

import type { TokenJwtService } from './token-jwt.service';
import type {
  IRefreshTokenRepository,
  StoredRefreshTokenRow,
} from '@modules/auth/domain/refresh-token/refresh-token.repository.interface';
import type { UserRole } from '@modules/auth/domain/user/user-role';

/** PII-safe `User` projection for auth envelopes. */
export interface SafeUser {
  id: number;
  email: string;
  firstname?: string | null;
  lastname?: string | null;
  role: UserRole;
  museumId?: number | null;
  onboardingCompleted: boolean;
}

export interface AuthSessionResponse {
  accessToken: string;
  refreshToken: string;
  /** seconds */
  expiresIn: number;
  /** seconds */
  refreshExpiresIn: number;
  user: SafeUser;
  /**
   * R16 — present when admin is inside MFA warning window. Absent when not
   * admin, already enrolled, or MFA already enforced (then shape becomes
   * `MfaRequiredResponse`).
   */
  mfaWarningDaysRemaining?: number;
}

/**
 * Refresh-token rotation contract: issue a fresh JWT pair (persist +
 * sliding-window anchor), reject reuse / expiry / idle-timeout before emit.
 * Banking-grade — co-pinned with `refresh-token.repository.pg.ts` as Stryker hot file.
 */
export class SessionIssuerService {
  /** Sliding-window threshold (ms). Exceeded → next refresh rejected + family revoked. */
  private readonly refreshIdleWindowMs: number;

  constructor(
    private readonly refreshTokenRepository: IRefreshTokenRepository,
    private readonly tokenJwt: TokenJwtService,
    refreshIdleWindowSeconds: number,
  ) {
    this.refreshIdleWindowMs = refreshIdleWindowSeconds * 1000;
  }

  /** Insert on first issue, rotate when `rotateFrom` set. */
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
      // Sliding-window anchor at issue/rotation time.
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

  /** Throws 401 with precise code on violation; revokes family on reuse/replay/idle. */
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

    // Sliding idle window — no rotation within threshold → force re-auth.
    // Legacy rows pre-`last_rotated_at`: fallback to createdAt (non-null by schema).
    const idleAnchor = stored.lastRotatedAt ?? stored.createdAt;
    const idleMs = Date.now() - idleAnchor.getTime();
    if (idleMs > this.refreshIdleWindowMs) {
      await this.refreshTokenRepository.revokeFamily(stored.familyId);
      throw unauthorized('Session idle timeout', 'SESSION_IDLE_TIMEOUT');
    }
  }
}
