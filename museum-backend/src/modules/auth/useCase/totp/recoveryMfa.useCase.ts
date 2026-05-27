import { AppError, badRequest, unauthorized } from '@shared/errors/app.error';

import { verifyMfaSessionToken } from './mfaSessionToken';
import { findRecoveryCodeIndex } from './recoveryCodes';

import type { IAccessTokenDenylist } from '@modules/auth/domain/session/access-token-denylist.port';
import type { ITotpSecretRepository } from '@modules/auth/domain/totp/totp-secret.repository.interface';
import type { IUserRepository } from '@modules/auth/domain/user/user.repository.interface';
import type {
  AuthSessionResponse,
  AuthSessionService,
} from '@modules/auth/useCase/session/authSession.service';

/**
 * Recovery-code path: exchange `mfaSessionToken + recoveryCode` for JWT pair.
 * One-time use server-enforced by an ATOMIC compare-and-set (`consumeRecoveryCode`)
 * — the matched entry's `consumedAt` is stamped only if still null, so N concurrent
 * submissions of the same code yield exactly one success (R5/R6). Resubmission of a
 * consumed code rejects INVALID_RECOVERY_CODE.
 */
export class RecoveryMfaUseCase {
  /**
   * Single-use enforcement (R7) — denylist optional, wired post-construction by
   * the composition root (mirrors `AuthSessionService.setAccessTokenDenylist`).
   * Absent ⇒ no single-use enforcement; the T2 recovery-CAS still closes
   * same-code replay regardless (design §9 D3).
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

  /** R7 — reject if this token's jti already minted a session. See challengeMfa. */
  private async assertTokenNotReplayed(jti: string | undefined): Promise<void> {
    if (jti && (await this.accessTokenDenylist?.has(jti))) {
      throw unauthorized('Invalid MFA session token', 'INVALID_MFA_SESSION');
    }
  }

  /**
   * R7 — denylist the token's jti after a successful recovery (single-use).
   * Fail-OPEN (ADR-064); no-op when jti absent (legacy token, D6).
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
      // Adapter contract is fail-OPEN (R9) — must not break a successful recovery.
    }
  }

  async execute(input: {
    mfaSessionToken: string;
    recoveryCode: string;
  }): Promise<{ session: AuthSessionResponse; userId: number; remainingCodes: number }> {
    const trimmed = input.recoveryCode.trim();
    if (!trimmed) {
      throw badRequest('recoveryCode is required');
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

    const matchedIndex = await findRecoveryCodeIndex(trimmed, row.recoveryCodes);
    if (matchedIndex === -1) {
      throw new AppError({
        message: 'Invalid recovery code.',
        statusCode: 401,
        code: 'INVALID_RECOVERY_CODE',
      });
    }

    // AUTHORITATIVE gate (R5/R6) — consume the matched entry atomically. The
    // `matchedIndex` is a coordinate from the bcrypt scan; correctness rests on
    // the adapter's `WHERE consumedAt IS NULL` guard, not on the read. Under
    // concurrency the row write-lock serialises: `affected === 1` ⇒ this caller
    // consumed the code, `affected === 0` ⇒ a concurrent winner already did ⇒
    // reject INVALID_RECOVERY_CODE and issue NO session.
    const consumeAt = new Date();
    const { affected } = await this.totpRepository.consumeRecoveryCode(
      userId,
      matchedIndex,
      consumeAt,
    );
    if (affected !== 1) {
      throw new AppError({
        message: 'Invalid recovery code.',
        statusCode: 401,
        code: 'INVALID_RECOVERY_CODE',
      });
    }

    // I-SEC7a — recovery codes are NOT TOTP codes (no RFC 6238 step), but the
    // `markUsed` ledger is the single timestamp source for "MFA last used". We
    // stamp the CURRENT step so a future TOTP code (necessarily a higher step) is
    // always accepted (recovery doesn't tighten the replay window). Recovery
    // one-use enforcement is the `consumeRecoveryCode` CAS above, NOT the step
    // ledger — so we ignore `markUsed`'s `{affected}` here (the recovery path's
    // single-use is already enforced; a step-ledger no-op must not fail recovery).
    const currentStep = Math.floor(consumeAt.getTime() / 1000 / 30);
    await this.totpRepository.markUsed(userId, consumeAt, currentStep);

    const session = await this.authSessionService.issueSessionForUser(user);
    await this.denylistTokenAfterSuccess(jti, exp);

    // Remaining count from a fresh read — the atomic CAS mutated the row in the
    // DB, so the in-memory `row.recoveryCodes` is now stale (design T2.5 note).
    const refreshed = await this.totpRepository.findByUserId(userId);
    const remainingCodes = (refreshed?.recoveryCodes ?? []).filter(
      (c) => c.consumedAt === null,
    ).length;

    return { session, userId, remainingCodes };
  }
}
