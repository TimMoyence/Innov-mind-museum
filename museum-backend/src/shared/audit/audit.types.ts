/** Audit actor types. */
type AuditActorType = 'user' | 'system' | 'anonymous';

/** Structured input for creating an audit log entry. */
export interface AuditLogEntry {
  action: string;
  actorType: AuditActorType;
  actorId?: number | null;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
  requestId?: string | null;
}

// ─── Auth events ───
export const AUDIT_AUTH_LOGIN_SUCCESS = 'AUTH_LOGIN_SUCCESS';
export const AUDIT_AUTH_LOGIN_FAILED = 'AUTH_LOGIN_FAILED';
export const AUDIT_AUTH_LOGOUT = 'AUTH_LOGOUT';
export const AUDIT_AUTH_REGISTER = 'AUTH_REGISTER';
export const AUDIT_AUTH_SOCIAL_LOGIN = 'AUTH_SOCIAL_LOGIN';
export const AUDIT_AUTH_PASSWORD_CHANGE = 'AUTH_PASSWORD_CHANGE';
export const AUDIT_AUTH_PASSWORD_RESET_REQUEST = 'AUTH_PASSWORD_RESET_REQUEST';
export const AUDIT_AUTH_PASSWORD_RESET = 'AUTH_PASSWORD_RESET';
export const AUDIT_AUTH_EMAIL_VERIFIED = 'AUTH_EMAIL_VERIFIED';
export const AUDIT_AUTH_EMAIL_CHANGE_REQUEST = 'AUTH_EMAIL_CHANGE_REQUEST';
export const AUDIT_AUTH_EMAIL_CHANGE_CONFIRMED = 'AUTH_EMAIL_CHANGE_CONFIRMED';
export const AUDIT_AUTH_ONBOARDING_COMPLETED = 'AUTH_ONBOARDING_COMPLETED';
export const AUDIT_AUTH_CONTENT_PREFERENCES_UPDATED = 'AUTH_CONTENT_PREFERENCES_UPDATED';

// ─── Account lifecycle ───
export const AUDIT_ACCOUNT_DELETED = 'ACCOUNT_DELETED';
export const AUDIT_DATA_EXPORT = 'DATA_EXPORT';

// ─── API key events ───
export const AUDIT_API_KEY_CREATED = 'API_KEY_CREATED';
export const AUDIT_API_KEY_REVOKED = 'API_KEY_REVOKED';

// ─── Security events ───
export const AUDIT_SECURITY_RATE_LIMIT = 'SECURITY_RATE_LIMIT';
export const AUDIT_SECURITY_GUARDRAIL_BLOCK = 'SECURITY_GUARDRAIL_BLOCK';
export const AUDIT_SECURITY_GUARDRAIL_PASS = 'SECURITY_GUARDRAIL_PASS';

// ─── Admin events (future RBAC) ───
export const AUDIT_ADMIN_ROLE_CHANGE = 'ADMIN_ROLE_CHANGE';
export const AUDIT_ADMIN_REPORT_RESOLVED = 'ADMIN_REPORT_RESOLVED';

// ─── Support ticket events ───
export const AUDIT_SUPPORT_TICKET_CREATED = 'SUPPORT_TICKET_CREATED';
export const AUDIT_ADMIN_TICKET_UPDATED = 'ADMIN_TICKET_UPDATED';

// ─── Review moderation events ───
export const AUDIT_ADMIN_REVIEW_MODERATED = 'ADMIN_REVIEW_MODERATED';
