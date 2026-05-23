import { assertPasswordReauth } from '@modules/auth/useCase/shared/assertPasswordReauth';

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
    await assertPasswordReauth(this.userRepository, userId, currentPassword);
    await this.totpRepository.deleteByUserId(userId);
  }
}
