import { AppError, badRequest } from '@shared/errors/app.error';

import { decryptTotpSecret } from './totpEncryption';
import { verifyTotpCode } from './totpService';

import type { ITotpSecretRepository } from '@modules/auth/domain/totp/totp-secret.repository.interface';
import type { IUserRepository } from '@modules/auth/domain/user/user.repository.interface';

export interface VerifyMfaResult {
  /** ISO-8601 — first enrollment timestamp (idempotent reads). */
  enrolledAt: string;
}

/**
 * Side effects:
 *   - Sets `enrolledAt` + `lastUsedAt` on totp_secrets.
 *   - Clears `users.mfa_enrollment_deadline` so warning/soft-block disappears.
 */
export class VerifyMfaUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly totpRepository: ITotpSecretRepository,
  ) {}

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
    const result = verifyTotpCode(secret, trimmed);
    if (!result) {
      throw new AppError({
        message: 'Invalid MFA code.',
        statusCode: 401,
        code: 'INVALID_MFA_CODE',
      });
    }

    // RFC 6238 §5.2 replay-protection on enrollment-verify too. Even though
    // `markEnrolled` would only ever stamp once (idempotent guard on enrolled_at),
    // seeding `lastUsedStep` here defends the FIRST post-enrollment challenge
    // against an attacker who captured the enrollment code (e.g. screen-cap of
    // QR + first 6 digits) and tries to replay it inside the ±30 s window.
    const lastStep = row.lastUsedStep === null ? null : Number(row.lastUsedStep);
    if (lastStep !== null && result.step <= lastStep) {
      throw new AppError({
        message: 'Invalid MFA code.',
        statusCode: 401,
        code: 'INVALID_MFA_CODE',
      });
    }

    const now = new Date();
    await this.totpRepository.markEnrolled(userId, now);
    await this.totpRepository.markUsed(userId, now, result.step);
    await this.userRepository.setMfaEnrollmentDeadline(userId, null);

    return {
      enrolledAt: (row.enrolledAt ?? now).toISOString(),
    };
  }
}
