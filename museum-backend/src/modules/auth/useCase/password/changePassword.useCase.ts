import bcrypt from 'bcrypt';

import { assertPasswordReauth } from '@modules/auth/useCase/shared/assertPasswordReauth';
import { badRequest } from '@shared/errors/app.error';
import { validatePassword } from '@shared/validation/password';
import { assertPasswordNotBreached } from '@shared/validation/password-breach-check';

import type { IRefreshTokenRepository } from '@modules/auth/domain/refresh-token/refresh-token.repository.interface';
import type { IUserRepository } from '@modules/auth/domain/user/user.repository.interface';

export class ChangePasswordUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly refreshTokenRepository: IRefreshTokenRepository,
  ) {}

  async execute(userId: number, currentPassword: string, newPassword: string): Promise<void> {
    const user = await assertPasswordReauth(this.userRepository, userId, currentPassword);

    const pw = validatePassword(newPassword);
    if (!pw.valid) {
      throw badRequest(pw.reason ?? 'Invalid password');
    }

    await assertPasswordNotBreached(newPassword);

    const isSame = await bcrypt.compare(newPassword, user.password);
    if (isSame) {
      throw badRequest('New password must be different from current password');
    }

    await this.userRepository.updatePassword(userId, newPassword);
    await this.refreshTokenRepository.revokeAllForUser(userId);
  }
}
