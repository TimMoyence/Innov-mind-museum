import { AppError } from '@shared/errors/app.error';
import { logger } from '@shared/logger/logger';

import type { IUserRepository } from '../domain/user.repository.interface';
/** Minimal port for image cleanup — avoids direct coupling to chat adapter internals. */
export interface ImageCleanupPort {
  deleteByPrefix(prefix: string): Promise<void>;
}

/** Orchestrates permanent user account deletion (GDPR right-to-erasure). */
export class DeleteAccountUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly imageStorage?: ImageCleanupPort,
  ) {}

  /**
   * Delete a user and all associated data (sessions, messages, tokens, social accounts, images).
   *
   * @param userId - The ID of the user to delete.
   * @throws {AppError} 404 if the user does not exist.
   */
  async execute(userId: number): Promise<void> {
    const user = await this.userRepository.getUserById(userId);
    if (!user) {
      throw new AppError({
        message: 'User not found',
        statusCode: 404,
        code: 'USER_NOT_FOUND',
      });
    }

    // Delete stored images (RGPD compliance — SEC-23)
    if (this.imageStorage) {
      try {
        await this.imageStorage.deleteByPrefix(`user-${String(userId)}`);
      } catch (error) {
        logger.warn('delete_account_image_cleanup_failed', {
          userId,
          error: (error as Error).message,
        });
      }
    }

    // Full RGPD deletion — transaction:
    // 1. chat_sessions (CASCADE → messages, artwork_matches, reports)
    // 2. users (CASCADE → refresh_tokens, social_accounts)
    await this.userRepository.deleteUser(userId);
  }
}
