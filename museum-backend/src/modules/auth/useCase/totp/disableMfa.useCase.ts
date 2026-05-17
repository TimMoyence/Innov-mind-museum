import bcrypt from 'bcrypt';

import { AppError, badRequest } from '@shared/errors/app.error';

import type { ITotpSecretRepository } from '@modules/auth/domain/totp/totp-secret.repository.interface';
import type { IUserRepository } from '@modules/auth/domain/user/user.repository.interface';

/**
 * Re-auth mandatory — hijacked session must NOT remove the second factor.
 * Re-enrollment after `disable` always rotates the shared secret + recovery
 * codes (never reuses old material).
 */
export class DisableMfaUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly totpRepository: ITotpSecretRepository,
  ) {}

  async execute(userId: number, currentPassword: string): Promise<void> {
    const user = await this.userRepository.getUserById(userId);
    if (!user) {
      throw new AppError({ message: 'User not found', statusCode: 404, code: 'NOT_FOUND' });
    }
    if (!user.password) {
      // Social-only accounts can't reauth via password — intentional dead-end
      // (cf. `changePassword`). Different trust path TBD.
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
