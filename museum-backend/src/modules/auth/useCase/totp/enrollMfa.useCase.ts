import { AppError } from '@shared/errors/app.error';

import { generateRecoveryCodes } from './recoveryCodes';
import { encryptTotpSecret } from './totpEncryption';
import { generateTotpSecret } from './totpService';

import type { ITotpSecretRepository } from '../../domain/totp-secret.repository.interface';
import type { IUserRepository } from '../../domain/user.repository.interface';

/** Result of starting (or rotating) an MFA enrollment. */
export interface EnrollMfaResult {
  /** `otpauth://totp/...` URI for QR rendering. */
  otpauthUrl: string;
  /** Base32 secret — surfaced for users without a QR scanner (manual entry). */
  manualSecret: string;
  /**
   * One-time view of the 10 plain recovery codes. The backend never returns
   * these again; the frontend must ensure the user persists them before
   * leaving the screen.
   */
  recoveryCodes: string[];
}

/**
 * Issues (or rotates) a TOTP shared secret + recovery codes for the caller.
 *
 * Idempotency: calling twice before completing `verifyMfa` rotates both
 * pieces — old QR / codes are useless. After a successful `verifyMfa`,
 * calling enroll again is rejected with 409 so the user has to disable MFA
 * first (re-auth required) before re-enrolling. This prevents an attacker
 * who hijacked an authenticated admin session from silently rotating MFA
 * material away from the legitimate user.
 */
export class EnrollMfaUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly totpRepository: ITotpSecretRepository,
  ) {}

  /** Generate fresh secret + codes and persist them encrypted/hashed. */
  async execute(userId: number): Promise<EnrollMfaResult> {
    const user = await this.userRepository.getUserById(userId);
    if (!user) {
      throw new AppError({ message: 'User not found', statusCode: 404, code: 'NOT_FOUND' });
    }

    const existing = await this.totpRepository.findByUserId(userId);
    if (existing?.enrolledAt) {
      throw new AppError({
        message: 'MFA is already enrolled. Disable it first to re-enroll.',
        statusCode: 409,
        code: 'MFA_ALREADY_ENROLLED',
      });
    }

    const { base32, otpauthUrl } = generateTotpSecret(user.email);
    const secretEncrypted = encryptTotpSecret(base32);
    const { plain, persisted } = await generateRecoveryCodes();

    await this.totpRepository.upsertEnrollment({
      userId,
      secretEncrypted,
      recoveryCodes: persisted,
    });

    return {
      otpauthUrl,
      manualSecret: base32,
      recoveryCodes: plain,
    };
  }
}
