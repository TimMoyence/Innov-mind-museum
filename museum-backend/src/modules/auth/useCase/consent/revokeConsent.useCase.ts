import { CONSENT_SCOPES } from '@modules/auth/domain/consent/userConsent.entity';
import { badRequest } from '@shared/errors/app.error';

import type { ConsentScope } from '@modules/auth/domain/consent/userConsent.entity';
import type { IUserConsentRepository } from '@modules/auth/domain/consent/userConsent.repository.interface';

const isConsentScope = (value: string): value is ConsentScope =>
  (CONSENT_SCOPES as readonly string[]).includes(value);

/** Revokes any active consent for the given (user, scope) pair. */
export class RevokeConsentUseCase {
  constructor(private readonly repository: IUserConsentRepository) {}

  /**
   * Validates scope and stamps `revokedAt` on the active grant for (userId, scope).
   *
   * @param userId - Authenticated user id.
   * @param scope - Consent scope to revoke.
   */
  async execute(userId: number, scope: string): Promise<void> {
    if (!isConsentScope(scope)) {
      throw badRequest(`Unknown consent scope: ${scope}`);
    }
    await this.repository.revoke(userId, scope);
  }
}
