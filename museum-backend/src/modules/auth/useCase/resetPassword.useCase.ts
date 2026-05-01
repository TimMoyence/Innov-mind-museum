import crypto from 'node:crypto';

import bcrypt from 'bcrypt';

import { badRequest } from '@shared/errors/app.error';
import { BCRYPT_ROUNDS } from '@shared/security/bcrypt';
import { validatePassword } from '@shared/validation/password';
import { assertPasswordNotBreached } from '@shared/validation/password-breach-check';

import type { IRefreshTokenRepository } from '../domain/refresh-token.repository.interface';
import type { IUserRepository } from '../domain/user.repository.interface';

/**
 * Orchestrates password reset using a one-time token (atomic consume + update).
 * Revokes all active refresh tokens on success (OWASP Forgot Password Cheat Sheet).
 */
export class ResetPasswordUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly refreshTokenRepository: IRefreshTokenRepository,
  ) {}

  /**
   * Validate a reset token, update the user's password, and revoke all sessions.
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
    // F10 — block breached passwords at reset; same fail-open semantics as registration.
    await assertPasswordNotBreached(newPassword);
    const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
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
