import { badRequest } from '@shared/errors/app.error';

import type { IUserRepository } from '../domain/user.repository.interface';

/** Verifies a user's email by consuming a verification token. */
export class VerifyEmailUseCase {
  constructor(private readonly userRepository: IUserRepository) {}

  /** Consumes a verification token and marks the associated email as verified. */
  async execute(token: string): Promise<{ verified: true }> {
    if (!token.trim()) {
      throw badRequest('Verification token is required');
    }

    const user = await this.userRepository.verifyEmail(token.trim());
    if (!user) {
      throw badRequest('Invalid or expired verification token');
    }

    return { verified: true };
  }
}
