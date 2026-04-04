import bcrypt from 'bcrypt';

import { AppError, badRequest } from '@shared/errors/app.error';
import { validatePassword } from '@shared/validation/password';

import type { IRefreshTokenRepository } from '../domain/refresh-token.repository.interface';
import type { IUserRepository } from '../domain/user.repository.interface';

/**
 * Changes a user's password after verifying the current one.
 * Revokes all refresh tokens to force re-authentication on other devices.
 *
 * CRITICAL: Do NOT hash the new password here — `updatePassword()` hashes internally.
 * Passing a pre-hashed value would cause double-hashing → unverifiable passwords.
 */
export class ChangePasswordUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly refreshTokenRepository: IRefreshTokenRepository,
  ) {}

  /** Verifies the current password, validates the new one, and updates it across all sessions. */
  async execute(userId: number, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.userRepository.getUserById(userId);
    if (!user) {
      throw new AppError({ message: 'User not found', statusCode: 404, code: 'NOT_FOUND' });
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

    const isSame = await bcrypt.compare(newPassword, user.password);
    if (isSame) {
      throw badRequest('New password must be different from current password');
    }

    // updatePassword() hashes internally — pass plain-text
    await this.userRepository.updatePassword(userId, newPassword);
    await this.refreshTokenRepository.revokeAllForUser(userId);
  }
}
