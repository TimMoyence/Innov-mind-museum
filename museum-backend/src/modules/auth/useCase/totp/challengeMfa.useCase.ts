import { AppError, badRequest } from '@shared/errors/app.error';

import { verifyMfaSessionToken } from './mfaSessionToken';
import { decryptTotpSecret } from './totpEncryption';
import { verifyTotpCode } from './totpService';

import type { ITotpSecretRepository } from '@modules/auth/domain/totp/totp-secret.repository.interface';
import type { IUserRepository } from '@modules/auth/domain/user/user.repository.interface';
import type {
  AuthSessionResponse,
  AuthSessionService,
} from '@modules/auth/useCase/session/authSession.service';

/**
 * MFA login step 2: exchange `mfaSessionToken + 6-digit code` for JWT pair.
 * Failures 401. Route rate-limits by user id (5 tries / 15 min) — see `mfa.route.ts`.
 */
export class ChallengeMfaUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly totpRepository: ITotpSecretRepository,
    private readonly authSessionService: AuthSessionService,
  ) {}

  async execute(input: {
    mfaSessionToken: string;
    code: string;
  }): Promise<{ session: AuthSessionResponse; userId: number }> {
    const trimmedCode = input.code.trim();
    if (!/^\d{6}$/.test(trimmedCode)) {
      throw badRequest('TOTP code must be exactly 6 digits.');
    }

    const { userId } = verifyMfaSessionToken(input.mfaSessionToken);

    const user = await this.userRepository.getUserById(userId);
    if (!user) {
      throw new AppError({
        message: 'Invalid MFA session token',
        statusCode: 401,
        code: 'INVALID_MFA_SESSION',
      });
    }

    const row = await this.totpRepository.findByUserId(userId);
    if (!row?.enrolledAt) {
      throw new AppError({
        message: 'MFA is not enrolled for this account.',
        statusCode: 401,
        code: 'MFA_NOT_ENROLLED',
      });
    }

    const secret = decryptTotpSecret(row.secretEncrypted);
    if (!verifyTotpCode(secret, trimmedCode)) {
      throw new AppError({
        message: 'Invalid MFA code.',
        statusCode: 401,
        code: 'INVALID_MFA_CODE',
      });
    }

    await this.totpRepository.markUsed(userId, new Date());

    const session = await this.authSessionService.issueSessionForUser(user);
    return { session, userId };
  }
}
