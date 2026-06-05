import bcrypt from 'bcrypt';

import { assertPasswordReauth } from '@modules/auth/useCase/shared/assertPasswordReauth';
import { badRequest } from '@shared/errors/app.error';
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
    const user = await assertPasswordReauth(this.userRepository, userId, currentPassword);

    const pw = validatePassword(newPassword);
    if (!pw.valid) {
      throw badRequest(pw.reason ?? 'Invalid password');
    }

    // F10 — block breached new passwords at change (banking-grade default).
    await assertPasswordNotBreached(newPassword);

    // `user.password` is typed `string` (not `string | null`) here — the
    // re-auth helper narrows the return type via `ReauthenticatedUser`.
    const isSame = await bcrypt.compare(newPassword, user.password);
    if (isSame) {
      throw badRequest('New password must be different from current password');
    }

    // updatePassword() hashes internally — pass plain-text.
    await this.userRepository.updatePassword(userId, newPassword);
    await this.refreshTokenRepository.revokeAllForUser(userId);
  }
}
