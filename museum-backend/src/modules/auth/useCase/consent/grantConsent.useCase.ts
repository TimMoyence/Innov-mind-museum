import { CONSENT_SCOPES, CONSENT_SOURCES } from '@modules/auth/domain/consent/userConsent.entity';
import { badRequest } from '@shared/errors/app.error';

import { buildConsentAuditMetadata, mapScopeToGrantAuditAction } from './consent-audit-mapping';

import type {
  ConsentScope,
  ConsentSource,
  UserConsent,
} from '@modules/auth/domain/consent/userConsent.entity';
import type { IUserConsentRepository } from '@modules/auth/domain/consent/userConsent.repository.interface';
import type { AuditLogEntry } from '@shared/audit';

const isConsentScope = (value: string): value is ConsentScope =>
  (CONSENT_SCOPES as readonly string[]).includes(value);

const isConsentSource = (value: string): value is ConsentSource =>
  (CONSENT_SOURCES as readonly string[]).includes(value);

/** Subset of AuditService the use case depends on (decoupled for tests). */
export interface ConsentAuditSink {
  log(entry: AuditLogEntry): Promise<void>;
}

/** Optional per-request context the route passes through for the audit row. */
export interface ConsentAuditContext {
  ip?: string | null;
  requestId?: string | null;
}

/** Records a new active consent for a user. */
export class GrantConsentUseCase {
  constructor(
    private readonly repository: IUserConsentRepository,
    private readonly auditSink?: ConsentAuditSink,
  ) {}

  /**
   * Validates scope/source/version and records a new active consent grant.
   * On success, emits an `AUDIT_CONSENT_GRANTED_*` hash-chained audit row
   * (action chosen per `mapScopeToGrantAuditAction`). Audit emission is
   * awaited but never throws — a failing audit pipeline must not break
   * registration or revocation calls (the consent row itself is already
   * durable).
   *
   * @param userId - Authenticated user id.
   * @param scope - Consent scope (must be one of CONSENT_SCOPES).
   * @param version - Policy version at time of grant.
   * @param source - Capture source (ui / api / registration).
   * @param auditContext - Optional `{ ip, requestId }` from the request.
   */
  async execute(
    userId: number,
    scope: string,
    version: string,
    source: string,
    auditContext?: ConsentAuditContext,
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
