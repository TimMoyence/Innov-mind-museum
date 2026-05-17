import { AppError } from '@shared/errors/app.error';

import { generateRecoveryCodes } from './recoveryCodes';
import { encryptTotpSecret } from './totpEncryption';
import { generateTotpSecret } from './totpService';

import type { ITotpSecretRepository } from '@modules/auth/domain/totp/totp-secret.repository.interface';
import type { IUserRepository } from '@modules/auth/domain/user/user.repository.interface';

export interface EnrollMfaResult {
  /** `otpauth://totp/...` URI for QR. */
  otpauthUrl: string;
  /** Base32 secret for manual entry (users without QR scanner). */
  manualSecret: string;
  /** One-time view — backend never returns these again; FE MUST persist before user leaves. */
  recoveryCodes: string[];
}

/**
 * Idempotency: calling twice before `verifyMfa` rotates both — old QR/codes useless.
 * After successful `verifyMfa`, re-enroll is rejected with 409 — user must disable
 * first (re-auth required). Prevents a hijacked admin session from silently rotating
 * MFA material away from the legitimate user.
 */
export class EnrollMfaUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly totpRepository: ITotpSecretRepository,
  ) {}

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
