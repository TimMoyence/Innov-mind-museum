import { AppError, badRequest } from '@shared/errors/app.error';

import { verifyMfaSessionToken } from './mfaSessionToken';
import { findRecoveryCodeIndex, markCodeConsumed } from './recoveryCodes';

import type { ITotpSecretRepository } from '@modules/auth/domain/totp/totp-secret.repository.interface';
import type { IUserRepository } from '@modules/auth/domain/user/user.repository.interface';
import type {
  AuthSessionResponse,
  AuthSessionService,
} from '@modules/auth/useCase/session/authSession.service';

/**
 * Recovery-code path: exchange `mfaSessionToken + recoveryCode` for JWT pair.
 * One-time use server-enforced: matched entry's `consumedAt` stamped in same
 * persistence call as JWT issuance. Resubmission rejects with INVALID_RECOVERY_CODE
 * because `findRecoveryCodeIndex` skips consumed entries.
 */
export class RecoveryMfaUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly totpRepository: ITotpSecretRepository,
    private readonly authSessionService: AuthSessionService,
  ) {}

  async execute(input: {
    mfaSessionToken: string;
    recoveryCode: string;
  }): Promise<{ session: AuthSessionResponse; userId: number; remainingCodes: number }> {
    const trimmed = input.recoveryCode.trim();
    if (!trimmed) {
      throw badRequest('recoveryCode is required');
    }

    const { userId } = verifyMfaSessionToken(input.mfaSessionToken);

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

    const updated = markCodeConsumed(row.recoveryCodes, matchedIndex, new Date());
    await this.totpRepository.updateRecoveryCodes(userId, updated);
    // I-SEC7a — recovery codes are NOT TOTP codes (no RFC 6238 step), but the
    // `markUsed` ledger is the single timestamp source for "MFA last used".
    // We stamp the CURRENT step so a future TOTP code (necessarily a higher
    // step) is always accepted (recovery doesn't tighten the replay window).
    // Recovery one-use enforcement remains the `consumedAt` flag, NOT the step
    // ledger — spec §2 keeps RecoveryMfa out of the replay-protection scope.
    const now = new Date();
    const currentStep = Math.floor(now.getTime() / 1000 / 30);
    await this.totpRepository.markUsed(userId, now, currentStep);

    const session = await this.authSessionService.issueSessionForUser(user);
    const remainingCodes = updated.filter((c) => c.consumedAt === null).length;

    return { session, userId, remainingCodes };
  }
}
