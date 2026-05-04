import { AppDataSource } from '@data/db/data-source';

import { AuditRepositoryPg } from './audit.repository.pg';
import { AuditService } from './audit.service';

const auditRepository = new AuditRepositoryPg(AppDataSource);

/** Singleton audit service instance, ready to use across the application. */
export const auditService = new AuditService(auditRepository);

export { AuditService } from './audit.service';
export type {
  BreachAuditEvent,
  BreachAuditResult,
  BreachContainmentStatus,
  BreachDataClass,
  BreachDetectionSource,
  BreachSeverity,
} from './audit.service';
export { BREACH_EVENT_SET, BREACH_EVENTS } from './breach-event-types';
export type { BreachEventName } from './breach-event-types';
export { AUDIT_CHAIN_GENESIS_HASH, computeRowHash, verifyAuditChain } from './audit-chain';
export type { AuditChainInput, AuditChainRow, AuditChainVerifyResult } from './audit-chain';
export type { IAuditLogRepository } from './audit.repository.interface';
export type { AuditLogEntry } from './audit.types';
export type { AuditLog } from './auditLog.entity';
export {
  AUDIT_AUTH_LOGIN_SUCCESS,
  AUDIT_AUTH_LOGIN_FAILED,
  AUDIT_AUTH_LOGOUT,
  AUDIT_AUTH_REGISTER,
  AUDIT_AUTH_SOCIAL_LOGIN,
  AUDIT_AUTH_PASSWORD_CHANGE,
  AUDIT_AUTH_PASSWORD_RESET_REQUEST,
  AUDIT_AUTH_PASSWORD_RESET,
  AUDIT_AUTH_EMAIL_VERIFIED,
  AUDIT_ACCOUNT_DELETED,
  AUDIT_DATA_EXPORT,
  AUDIT_API_KEY_CREATED,
  AUDIT_API_KEY_REVOKED,
  AUDIT_SECURITY_RATE_LIMIT,
  AUDIT_SECURITY_GUARDRAIL_BLOCK,
  AUDIT_SECURITY_GUARDRAIL_PASS,
  AUDIT_GUARDRAIL_BLOCKED_INPUT,
  AUDIT_GUARDRAIL_BLOCKED_OUTPUT,
  AUDIT_ADMIN_ROLE_CHANGE,
  AUDIT_ADMIN_REPORT_RESOLVED,
  AUDIT_SUPPORT_TICKET_CREATED,
  AUDIT_ADMIN_TICKET_UPDATED,
  AUDIT_ADMIN_REVIEW_MODERATED,
} from './audit.types';
