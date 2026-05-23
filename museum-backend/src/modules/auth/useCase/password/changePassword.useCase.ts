import bcrypt from 'bcrypt';

import { badRequest, notFound } from '@shared/errors/app.error';
import { validatePassword } from '@shared/validation/password';
import { assertPasswordNotBreached } from '@shared/validation/password-breach-check';

import type { IRefreshTokenRepository } from '@modules/auth/domain/refresh-token/refresh-token.repository.interface';
import type { IUserRepository } from '@modules/auth/domain/user/user.repository.interface';

/**
 * CRITICAL: do NOT hash newPassword here — `updatePassword()` hashes internally.
 * Pre-hashing would cause double-hashing → unverifiable passwords.
 * Revokes all refresh tokens to force re-auth on other devices.
 */
export class ChangePasswordUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly refreshTokenRepository: IRefreshTokenRepository,
  ) {}

  async execute(userId: number, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.userRepository.getUserById(userId);
    if (!user) {
      throw notFound('User not found');
    }

    if (!user.password) {
      throw badRequest('Cannot change password for social-only accounts');
    }

    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      throw badRequest('Current password is incorrect');
    }

    const pw = validatePassword(newPassword);
    if (!pw.valid) {
      throw badRequest(pw.reason ?? 'Invalid password');
    }

    // F10 — block breached new passwords at change (banking-grade default).
    await assertPasswordNotBreached(newPassword);

    const isSame = await bcrypt.compare(newPassword, user.password);
    if (isSame) {
      throw badRequest('New password must be different from current password');
    }

    // updatePassword() hashes internally — pass plain-text.
    await this.userRepository.updatePassword(userId, newPassword);
    await this.refreshTokenRepository.revokeAllForUser(userId);
  }
}
