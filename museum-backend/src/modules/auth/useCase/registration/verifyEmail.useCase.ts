import crypto from 'node:crypto';

import { badRequest } from '@shared/errors/app.error';

import type { IUserRepository } from '@modules/auth/domain/user/user.repository.interface';

export class VerifyEmailUseCase {
  constructor(private readonly userRepository: IUserRepository) {}

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
