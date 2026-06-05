import { AppError, badRequest, unauthorized } from '@shared/errors/app.error';

import { verifyMfaSessionToken } from './mfaSessionToken';
import { decryptTotpSecret } from './totpEncryption';
import { verifyTotpCode } from './totpService';

import type { IAccessTokenDenylist } from '@modules/auth/domain/session/access-token-denylist.port';
import type { ITotpSecretRepository } from '@modules/auth/domain/totp/totp-secret.repository.interface';
import type { IUserRepository } from '@modules/auth/domain/user/user.repository.interface';
import type {
  AuthSessionResponse,
  AuthSessionService,
} from '@modules/auth/useCase/session/authSession.service';

/**
 * MFA login step 2: exchange `mfaSessionToken + 6-digit code` for JWT pair.
 * Failures 401. Route rate-limits by user id (5 tries / 15 min) — see `mfa.route.ts`.
 */
export class ChallengeMfaUseCase {
  /**
   * Single-use enforcement (R7) — denylist optional, wired post-construction by
   * the composition root (mirrors `AuthSessionService.setAccessTokenDenylist`).
   * Absent ⇒ no single-use enforcement (dev/tests not exercising it); the T1
   * step-CAS still closes same-code replay regardless (design §9 D3).
   */
  private accessTokenDenylist?: IAccessTokenDenylist;

  constructor(
    private readonly userRepository: IUserRepository,
    private readonly totpRepository: ITotpSecretRepository,
    private readonly authSessionService: AuthSessionService,
  ) {}

  setAccessTokenDenylist(denylist: IAccessTokenDenylist): void {
    this.accessTokenDenylist = denylist;
  }

  /**
   * R7 — single-use: a token whose jti is already denylisted has minted its one
   * allowed session. Fail-OPEN `has()` (ADR-064) never throws; a missing jti
   * (legacy token, D6) skips the check and relies on the T1 step-CAS.
   */
  private async assertTokenNotReplayed(jti: string | undefined): Promise<void> {
    if (jti && (await this.accessTokenDenylist?.has(jti))) {
      throw unauthorized('Invalid MFA session token', 'INVALID_MFA_SESSION');
    }
  }

  /**
   * R7 — after a token mints its one allowed session, denylist its jti for the
   * remaining TTL so a replay is rejected by {@link assertTokenNotReplayed}.
   * Fail-OPEN (ADR-064): a denylist outage degrades to T1-CAS-only single-use,
   * never an auth outage. No-op when jti is absent (legacy token, D6).
   */
  private async denylistTokenAfterSuccess(
    jti: string | undefined,
    exp: number | undefined,
  ): Promise<void> {
    if (!jti || !this.accessTokenDenylist) return;
    const ttlSec = (exp ?? 0) - Math.floor(Date.now() / 1000);
    if (ttlSec <= 0) return;
    try {
      await this.accessTokenDenylist.add(jti, ttlSec);
    } catch {
      // Adapter contract is fail-OPEN (R9) — an unexpected throw must not break
      // a successful challenge.
    }
  }

  async execute(input: {
    mfaSessionToken: string;
    code: string;
  }): Promise<{ session: AuthSessionResponse; userId: number }> {
    const trimmedCode = input.code.trim();
    if (!/^\d{6}$/.test(trimmedCode)) {
      throw badRequest('TOTP code must be exactly 6 digits.');
    }

    const { userId, jti, exp } = verifyMfaSessionToken(input.mfaSessionToken);
    await this.assertTokenNotReplayed(jti);

    const user = await this.userRepository.getUserById(userId);
    if (!user) {
      throw new AppError({
        message: 'Invalid MFA session token',
        statusCode: 401,
        code: 'INVALID_MFA_SESSION',
      });
    }

    const row = await this.totpRepository.findByUserId(userId);
    if (!row?.enrolledAt) {
      throw new AppError({
        message: 'MFA is not enrolled for this account.',
        statusCode: 401,
        code: 'MFA_NOT_ENROLLED',
      });
    }

    const secret = decryptTotpSecret(row.secretEncrypted);
    const result = verifyTotpCode(secret, trimmedCode);
    if (!result) {
      throw new AppError({
        message: 'Invalid MFA code.',
        statusCode: 401,
        code: 'INVALID_MFA_CODE',
      });
    }

    // RFC 6238 §5.2 replay-protection — reject codes whose accepted step is
    // ≤ the user's last-accepted step. Same `code: 'INVALID_MFA_CODE'` returned
    // so an attacker cannot distinguish "wrong code" from "replay detected"
    // (defense-in-depth, lib-docs/otpauth/LESSONS.md L52-54).
    const lastStep = row.lastUsedStep === null ? null : Number(row.lastUsedStep);
    if (lastStep !== null && result.step <= lastStep) {
      throw new AppError({
        message: 'Invalid MFA code.',
        statusCode: 401,
        code: 'INVALID_MFA_CODE',
      });
    }

    // AUTHORITATIVE gate (R2/R3) — the atomic compare-and-set is the single point
    // of replay-protection truth. The JS step pre-check above is defense-in-depth
    // (R9 indistinguishability) but cannot win a TOCTOU race; the CAS does. If a
    // concurrent request already consumed this step, `affected === 0` ⇒ this caller
    // lost the race ⇒ reject INVALID_MFA_CODE (same code as "wrong code", so an
    // attacker cannot distinguish a lost race from an invalid code) and issue NO
    // session.
    const { affected } = await this.totpRepository.markUsed(userId, new Date(), result.step);
    if (affected !== 1) {
      throw new AppError({
        message: 'Invalid MFA code.',
        statusCode: 401,
        code: 'INVALID_MFA_CODE',
      });
    }

    const session = await this.authSessionService.issueSessionForUser(user);
    await this.denylistTokenAfterSuccess(jti, exp);

    return { session, userId };
  }
}
