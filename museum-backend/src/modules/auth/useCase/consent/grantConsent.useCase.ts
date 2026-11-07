import { isConsentScope, isConsentSource } from '@modules/auth/domain/consent/userConsent.entity';
import { invalidInput } from '@shared/errors/app.error';

import { buildConsentAuditMetadata, mapScopeToGrantAuditAction } from './consent-audit-mapping';

import type { UserConsent } from '@modules/auth/domain/consent/userConsent.entity';
import type { IUserConsentRepository } from '@modules/auth/domain/consent/userConsent.repository.interface';
import type { AuditLogEntry } from '@shared/audit';

/** Subset of AuditService (decoupled for tests). */
export interface ConsentAuditSink {
  log(entry: AuditLogEntry): Promise<void>;
}

export interface ConsentAuditContext {
  ip?: string | null;
  requestId?: string | null;
}

export class GrantConsentUseCase {
  constructor(
    private readonly repository: IUserConsentRepository,
    private readonly auditSink?: ConsentAuditSink,
  ) {}

  /**
   * Emits an `AUDIT_CONSENT_GRANTED_*` hash-chained audit row on success.
   * Audit emission is awaited but never throws — a failing audit pipeline
   * must not break registration/revocation (the consent row is already durable).
   */
  async execute(
    userId: number,
    scope: string,
    version: string,
    source: string,
    auditContext?: ConsentAuditContext,
  ): Promise<UserConsent> {
    if (!isConsentScope(scope)) {
      throw invalidInput(`Unknown consent scope: ${scope}`);
    }
    if (!isConsentSource(source)) {
      throw invalidInput(`Unknown consent source: ${source}`);
    }
    if (!version || version.length > 32) {
      throw invalidInput('Invalid consent version');
    }
    const row = await this.repository.grant(userId, scope, version, source);
    if (this.auditSink) {
      await this.auditSink.log({
        action: mapScopeToGrantAuditAction(scope),
        actorType: 'user',
        actorId: userId,
        targetType: 'user_consent',
        targetId: String(row.id),
        metadata: buildConsentAuditMetadata(scope, version, source),
        ip: auditContext?.ip ?? null,
        requestId: auditContext?.requestId ?? null,
      });
    }
    return row;
  }
}
