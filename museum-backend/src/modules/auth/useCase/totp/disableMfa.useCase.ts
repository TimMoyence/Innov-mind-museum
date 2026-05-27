import { assertPasswordReauth } from '@modules/auth/useCase/shared/assertPasswordReauth';

import type { ITotpSecretRepository } from '@modules/auth/domain/totp/totp-secret.repository.interface';
import type { IUserRepository } from '@modules/auth/domain/user/user.repository.interface';

/**
 * Re-auth mandatory — hijacked session must NOT remove the second factor.
 * Re-enrollment after `disable` always rotates the shared secret + recovery
 * codes (never reuses old material).
 */
export class DisableMfaUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly totpRepository: ITotpSecretRepository,
  ) {}

  async execute(userId: number, currentPassword: string): Promise<void> {
    await assertPasswordReauth(this.userRepository, userId, currentPassword);
    // R8 — the row DELETION is the in-flight-token invalidation (design §9 D4b).
    // A `mfaSessionToken` minted before disable, presented after, hits the
    // `!row?.enrolledAt` guard in `ChallengeMfaUseCase` / `RecoveryMfaUseCase`
    // (findByUserId now returns null) → 401 `MFA_NOT_ENROLLED`, no session. No
    // separate jti-revocation store is needed: the disable request carries
    // `currentPassword`, not the mfaSessionToken, so its jti is not visible here —
    // deletion-as-invalidation is the KISS invariant that covers BOTH paths.
    await this.totpRepository.deleteByUserId(userId);
  }
}
