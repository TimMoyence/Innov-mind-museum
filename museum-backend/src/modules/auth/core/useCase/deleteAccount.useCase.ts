import { AppError } from '@shared/errors/app.error';
import type { IUserRepository } from '../domain/user.repository.interface';

/** Orchestrates permanent user account deletion (GDPR right-to-erasure). */
export class DeleteAccountUseCase {
  constructor(private readonly userRepository: IUserRepository) {}

  /**
   * Delete a user and all associated data (sessions, messages, tokens, social accounts).
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

    // Full RGPD deletion — transaction:
    // 1. chat_sessions (CASCADE → messages, artwork_matches, reports)
    // 2. users (CASCADE → refresh_tokens, social_accounts)
    await this.userRepository.deleteUser(userId);
  }
}
