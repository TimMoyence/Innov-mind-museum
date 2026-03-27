import crypto from 'node:crypto';

import { badRequest } from '@shared/errors/app.error';

import type { IUserRepository } from '../domain/user.repository.interface';

/** Confirms an email change by consuming a one-time token (atomic consume + update). */
export class ConfirmEmailChangeUseCase {
  constructor(private readonly userRepository: IUserRepository) {}

  /**
   * Validate an email change token and update the user's email atomically.
   *
   * @param token - The plain-text email change token sent to the new address.
   * @returns Confirmation result.
   * @throws {AppError} 400 if the token is invalid or expired.
   */
  async execute(token: string): Promise<{ confirmed: true }> {
    if (!token.trim()) {
      throw badRequest('Email change token is required');
    }

    const hashedToken = crypto.createHash('sha256').update(token.trim()).digest('hex');
    const user = await this.userRepository.consumeEmailChangeToken(hashedToken);
    if (!user) {
      throw badRequest('Invalid or expired email change token');
    }

    return { confirmed: true };
  }
}
