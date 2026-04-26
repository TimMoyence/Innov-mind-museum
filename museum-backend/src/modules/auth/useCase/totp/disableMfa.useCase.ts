import bcrypt from 'bcrypt';

import { AppError, badRequest } from '@shared/errors/app.error';

import type { ITotpSecretRepository } from '../../domain/totp-secret.repository.interface';
import type { IUserRepository } from '../../domain/user.repository.interface';

/**
 * Removes a user's TOTP enrollment after a fresh password re-auth.
 *
 * Reauth is mandatory — a hijacked session must NOT be able to remove the
 * second factor that protects the account. Re-enrollment after `disable`
 * always rotates the shared secret + recovery codes (never reuses the old
 * material).
 */
export class DisableMfaUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly totpRepository: ITotpSecretRepository,
  ) {}

  /** Drop the totp_secrets row after re-confirming the password. */
  async execute(userId: number, currentPassword: string): Promise<void> {
    const user = await this.userRepository.getUserById(userId);
    if (!user) {
      throw new AppError({ message: 'User not found', statusCode: 404, code: 'NOT_FOUND' });
    }
    if (!user.password) {
      // Social-only accounts cannot reauth via password — this is the
      // intentional dead-end documented for `changePassword`. Disabling MFA
      // for them must go through a different (yet-unspecified) trust path.
      throw badRequest('Cannot disable MFA on a social-only account.');
    }

    const ok = await bcrypt.compare(currentPassword, user.password);
    if (!ok) {
      throw new AppError({
        message: 'Invalid credentials',
        statusCode: 401,
        code: 'INVALID_CREDENTIALS',
      });
    }

    await this.totpRepository.deleteByUserId(userId);
  }
}
