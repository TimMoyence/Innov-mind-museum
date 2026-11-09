import bcrypt from 'bcrypt';

import { badRequest, invalidInput } from '@shared/errors/app.error';
import { BCRYPT_ROUNDS } from '@shared/security/bcrypt';
import { hashEmailTokenForLookup } from '@shared/security/single-use-email-token';
import { validatePassword } from '@shared/validation/password';
import { assertPasswordNotBreached } from '@shared/validation/password-breach-check';

import type { IRefreshTokenRepository } from '@modules/auth/domain/refresh-token/refresh-token.repository.interface';
import type { IUserRepository } from '@modules/auth/domain/user/user.repository.interface';

export class ResetPasswordUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly refreshTokenRepository: IRefreshTokenRepository,
  ) {}

  async execute(token: string, newPassword: string) {
    const pw = validatePassword(newPassword);
    if (!pw.valid) {
      throw invalidInput(pw.reason ?? 'Invalid password');
    }
    await assertPasswordNotBreached(newPassword);
    const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    const hashedToken = hashEmailTokenForLookup(token, { trim: false });
    const user = await this.userRepository.consumeResetTokenAndUpdatePassword(
      hashedToken,
      hashedPassword,
    );
    if (!user) {
      throw badRequest('Invalid or expired reset token');
    }
    await this.refreshTokenRepository.revokeAllForUser(user.id);
    return user;
  }
}
