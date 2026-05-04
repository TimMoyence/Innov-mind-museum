import { AppError, badRequest } from '@shared/errors/app.error';

import { decryptTotpSecret } from './totpEncryption';
import { verifyTotpCode } from './totpService';

import type { ITotpSecretRepository } from '../../domain/totp/totp-secret.repository.interface';
import type { IUserRepository } from '../../domain/user/user.repository.interface';

/** Result of confirming an enrollment. */
export interface VerifyMfaResult {
  /** ISO-8601 timestamp the row was first marked enrolled (idempotent reads). */
  enrolledAt: string;
}

/**
 * Confirms a freshly-enrolled secret by validating a 6-digit code from the
 * user's authenticator app. Side effects:
 *
 *   - Sets `enrolledAt` (and `lastUsedAt`) on the totp_secrets row.
 *   - Clears `users.mfa_enrollment_deadline` so the warning banner / soft
 *     block disappears immediately.
 */
export class VerifyMfaUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly totpRepository: ITotpSecretRepository,
  ) {}

  /** Validate the code and complete the enrollment for `userId`. */
  async execute(userId: number, code: string): Promise<VerifyMfaResult> {
    const trimmed = code.trim();
    if (!/^\d{6}$/.test(trimmed)) {
      throw badRequest('TOTP code must be exactly 6 digits.');
    }

    const row = await this.totpRepository.findByUserId(userId);
    if (!row) {
      throw new AppError({
        message: 'No pending MFA enrollment.',
        statusCode: 404,
        code: 'MFA_NOT_ENROLLED',
      });
    }

    const secret = decryptTotpSecret(row.secretEncrypted);
    if (!verifyTotpCode(secret, trimmed)) {
      throw new AppError({
        message: 'Invalid MFA code.',
        statusCode: 401,
        code: 'INVALID_MFA_CODE',
      });
    }

    const now = new Date();
    await this.totpRepository.markEnrolled(userId, now);
    await this.userRepository.setMfaEnrollmentDeadline(userId, null);

    return {
      enrolledAt: (row.enrolledAt ?? now).toISOString(),
    };
  }
}
