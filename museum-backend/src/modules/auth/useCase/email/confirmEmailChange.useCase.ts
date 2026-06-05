import { badRequest } from '@shared/errors/app.error';
import { hashEmailTokenForLookup } from '@shared/security/single-use-email-token';

import type { IRefreshTokenRepository } from '@modules/auth/domain/refresh-token/refresh-token.repository.interface';
import type { IUserRepository } from '@modules/auth/domain/user/user.repository.interface';

/**
 * Atomic consume + update. SEC-HARDENING M13: revokes all active refresh
 * tokens so a previously-captured token cannot continue to authenticate
 * under the new identity.
 */
export class ConfirmEmailChangeUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly refreshTokenRepository: IRefreshTokenRepository,
  ) {}

  /** @throws {AppError} 400 if token invalid or expired. */
  async execute(token: string): Promise<{ confirmed: true }> {
    if (!token.trim()) {
      throw badRequest('Email change token is required');
    }

    const hashedToken = hashEmailTokenForLookup(token);
    const user = await this.userRepository.consumeEmailChangeToken(hashedToken);
    if (!user) {
      throw badRequest('Invalid or expired email change token');
    }

    await this.refreshTokenRepository.revokeAllForUser(user.id);
    return { confirmed: true };
  }
}
