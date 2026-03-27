import bcrypt from 'bcrypt';

import { badRequest } from '@shared/errors/app.error';
import { BCRYPT_ROUNDS } from '@shared/security/bcrypt';
import { validatePassword } from '@shared/validation/password';

import type { IUserRepository } from '../domain/user.repository.interface';

/** Orchestrates password reset using a one-time token (atomic consume + update). */
export class ResetPasswordUseCase {
  constructor(private readonly userRepository: IUserRepository) {}

  /**
   * Validate a reset token and update the user's password atomically.
   *
   * @param token - The password-reset token.
   * @param newPassword - The new plain-text password.
   * @returns The updated user.
   * @throws {AppError} 400 if the token is invalid/expired or password is too weak.
   */
  async execute(token: string, newPassword: string) {
    const pw = validatePassword(newPassword);
    if (!pw.valid) {
      throw badRequest(pw.reason ?? 'Invalid password');
    }
    const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    const user = await this.userRepository.consumeResetTokenAndUpdatePassword(
      token,
      hashedPassword,
    );
    if (!user) {
      throw badRequest('Invalid or expired reset token');
    }
    return user;
  }
}
