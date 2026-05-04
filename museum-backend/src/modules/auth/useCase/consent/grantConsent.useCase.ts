import { CONSENT_SCOPES, CONSENT_SOURCES } from '@modules/auth/domain/consent/userConsent.entity';
import { badRequest } from '@shared/errors/app.error';

import type {
  ConsentScope,
  ConsentSource,
  UserConsent,
} from '@modules/auth/domain/consent/userConsent.entity';
import type { IUserConsentRepository } from '@modules/auth/domain/consent/userConsent.repository.interface';

const isConsentScope = (value: string): value is ConsentScope =>
  (CONSENT_SCOPES as readonly string[]).includes(value);

const isConsentSource = (value: string): value is ConsentSource =>
  (CONSENT_SOURCES as readonly string[]).includes(value);

/** Records a new active consent for a user. */
export class GrantConsentUseCase {
  constructor(private readonly repository: IUserConsentRepository) {}

  /**
   * Validates scope/source/version and records a new active consent grant.
   *
   * @param userId - Authenticated user id.
   * @param scope - Consent scope (must be one of CONSENT_SCOPES).
   * @param version - Policy version at time of grant.
   * @param source - Capture source (ui / api / registration).
   */
  async execute(
    userId: number,
    scope: string,
    version: string,
    source: string,
  ): Promise<UserConsent> {
    if (!isConsentScope(scope)) {
      throw badRequest(`Unknown consent scope: ${scope}`);
    }
    if (!isConsentSource(source)) {
      throw badRequest(`Unknown consent source: ${source}`);
    }
    if (!version || version.length > 32) {
      throw badRequest('Invalid consent version');
    }
    return await this.repository.grant(userId, scope, version, source);
  }
}
