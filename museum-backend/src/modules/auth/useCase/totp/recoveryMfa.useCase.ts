import { AppError, badRequest } from '@shared/errors/app.error';

import { verifyMfaSessionToken } from './mfaSessionToken';
import { findRecoveryCodeIndex, markCodeConsumed } from './recoveryCodes';

import type { ITotpSecretRepository } from '../../domain/totp-secret.repository.interface';
import type { IUserRepository } from '../../domain/user.repository.interface';
import type { AuthSessionResponse, AuthSessionService } from '../authSession.service';

/**
 * Recovery-code path of the MFA login flow: exchange `mfaSessionToken +
 * recoveryCode` for a real JWT pair, marking the consumed code as such.
 *
 * One-time use is enforced server-side: the matched entry's `consumedAt` is
 * stamped within the same persistence call that issues JWTs. A second
 * submission of the same code rejects with `INVALID_RECOVERY_CODE` because
 * `findRecoveryCodeIndex` skips already-consumed entries.
 */
export class RecoveryMfaUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly totpRepository: ITotpSecretRepository,
    private readonly authSessionService: AuthSessionService,
  ) {}

  /** Consume one recovery code and issue JWTs. */
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
    await this.totpRepository.markUsed(userId, new Date());

    const session = await this.authSessionService.issueSessionForUser(user);
    const remainingCodes = updated.filter((c) => c.consumedAt === null).length;

    return { session, userId, remainingCodes };
  }
}
