import crypto from 'node:crypto';

import { unauthorized } from '@shared/errors/app.error';

import type { TokenJwtService } from './token-jwt.service';
import type {
  IRefreshTokenRepository,
  StoredRefreshTokenRow,
} from '@modules/auth/domain/refresh-token/refresh-token.repository.interface';
import type { UserRole } from '@modules/auth/domain/user/user-role';

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
  expiresIn: number;
  refreshExpiresIn: number;
  user: SafeUser;
}

export class SessionIssuerService {
  private readonly refreshIdleWindowMs: number;

  constructor(
    private readonly refreshTokenRepository: IRefreshTokenRepository,
    private readonly tokenJwt: TokenJwtService,
    refreshIdleWindowSeconds: number,
  ) {
    this.refreshIdleWindowMs = refreshIdleWindowSeconds * 1000;
  }

  async issueSession(params: {
    user: SafeUser;
    familyId?: string;
    rotateFrom?: StoredRefreshTokenRow;
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
      lastRotatedAt: issuedAt,
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
      expiresIn: this.tokenJwt.accessTtlSeconds,
      refreshExpiresIn: this.tokenJwt.refreshTtlSeconds,
      user: params.user,
    };
  }

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

    const idleAnchor = stored.lastRotatedAt ?? stored.createdAt;
    const idleMs = Date.now() - idleAnchor.getTime();
    if (idleMs > this.refreshIdleWindowMs) {
      await this.refreshTokenRepository.revokeFamily(stored.familyId);
      throw unauthorized('Session idle timeout', 'SESSION_IDLE_TIMEOUT');
    }
  }
}
