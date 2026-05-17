import { CONSENT_SCOPES } from '@modules/auth/domain/consent/userConsent.entity';
import { badRequest } from '@shared/errors/app.error';

import { buildConsentAuditMetadata, mapScopeToRevokeAuditAction } from './consent-audit-mapping';

import type { ConsentAuditContext, ConsentAuditSink } from './grantConsent.useCase';
import type { ConsentScope } from '@modules/auth/domain/consent/userConsent.entity';
import type { IUserConsentRepository } from '@modules/auth/domain/consent/userConsent.repository.interface';

const isConsentScope = (value: string): value is ConsentScope =>
  (CONSENT_SCOPES as readonly string[]).includes(value);

export class RevokeConsentUseCase {
  constructor(
    private readonly repository: IUserConsentRepository,
    private readonly auditSink?: ConsentAuditSink,
  ) {}

  /**
   * Emits `AUDIT_CONSENT_REVOKED_*` only when a row was effectively revoked.
   * Idempotent no-op when no active grant exists.
   */
  async execute(userId: number, scope: string, auditContext?: ConsentAuditContext): Promise<void> {
    if (!isConsentScope(scope)) {
      throw badRequest(`Unknown consent scope: ${scope}`);
    }
    const wasActive = await this.repository.isGranted(userId, scope);
    await this.repository.revoke(userId, scope);
    if (wasActive && this.auditSink) {
      await this.auditSink.log({
        action: mapScopeToRevokeAuditAction(scope),
        actorType: 'user',
        actorId: userId,
        targetType: 'user_consent',
        targetId: null,
        metadata: buildConsentAuditMetadata(scope, '', 'revoke'),
        ip: auditContext?.ip ?? null,
        requestId: auditContext?.requestId ?? null,
      });
    }
  }
}
