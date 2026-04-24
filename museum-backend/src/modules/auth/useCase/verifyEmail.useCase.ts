import crypto from 'node:crypto';

import { badRequest } from '@shared/errors/app.error';

import type { IUserRepository } from '../domain/user.repository.interface';

/** Verifies a user's email by consuming a verification token. */
export class VerifyEmailUseCase {
  constructor(private readonly userRepository: IUserRepository) {}

  /** Consumes a verification token and marks the associated email as verified. */
  async execute(token: string): Promise<{ verified: true }> {
    const trimmed = token.trim();
    if (!trimmed) {
      throw badRequest('Verification token is required');
    }

    // SEC (H2): hash the raw token before lookup — DB only stores the SHA-256 digest.
    const hashedToken = crypto.createHash('sha256').update(trimmed).digest('hex');

    const user = await this.userRepository.verifyEmail(hashedToken);
    if (!user) {
      throw badRequest('Invalid or expired verification token');
    }

    return { verified: true };
  }
}
