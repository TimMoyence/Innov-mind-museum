type AuditActorType = 'user' | 'system' | 'anonymous';

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
export const AUDIT_AUTH_TTS_VOICE_UPDATED = 'AUTH_TTS_VOICE_UPDATED';
// TD-2 — batch update of 5 profile preferences via `/api/auth/me/preferences`.
// Metadata = raw patch (no PII) for toggle-by-toggle history reconstruction.
export const AUDIT_AUTH_PROFILE_PREFERENCES_UPDATED = 'AUTH_PROFILE_PREFERENCES_UPDATED';

// ─── Account lifecycle ───
// Cycle D (R1) — durable "the deletion was requested" trace, emitted BEFORE any
// erasure runs. Pairs with AUDIT_ACCOUNT_DELETED (emitted only AFTER success):
// a REQUESTED row without a DELETED row is a forensic signal of a failed/aborted
// erasure; a DELETED row is never written unless the cascade actually ran.
export const AUDIT_ACCOUNT_DELETION_REQUESTED = 'ACCOUNT_DELETION_REQUESTED';
export const AUDIT_ACCOUNT_DELETED = 'ACCOUNT_DELETED';
export const AUDIT_DATA_EXPORT = 'DATA_EXPORT';

// ─── API key events ───
export const AUDIT_API_KEY_CREATED = 'API_KEY_CREATED';
export const AUDIT_API_KEY_REVOKED = 'API_KEY_REVOKED';

// ─── Security events ───
export const AUDIT_SECURITY_RATE_LIMIT = 'SECURITY_RATE_LIMIT';
export const AUDIT_SECURITY_GUARDRAIL_BLOCK = 'SECURITY_GUARDRAIL_BLOCK';
export const AUDIT_SECURITY_GUARDRAIL_PASS = 'SECURITY_GUARDRAIL_PASS';
// ADR-047 (2026-05-12) — emitted on every LLM Guard sidecar circuit-breaker
// transition into OPEN. Metadata-only (no raw prompts); correlate with /metrics.
export const AUDIT_SECURITY_LLM_GUARD_BREAKER_OPEN = 'SECURITY_LLM_GUARD_BREAKER_OPEN';
// V13 / STRIDE R3 — phase-scoped (input vs output). Redacted snippet (≤64
// chars) + sha256 fingerprint for forensic dedup without echoing raw payloads.
export const AUDIT_GUARDRAIL_BLOCKED_INPUT = 'guardrail_blocked_input';
export const AUDIT_GUARDRAIL_BLOCKED_OUTPUT = 'guardrail_blocked_output';
// LLM02 (2026-05-14) — guardrail returned sanitized input (PII scrubbed via
// Anonymize / Presidio). Payload = post-scrub text + placeholder counts ONLY
// (raw PII NEVER reaches the audit chain).
export const AUDIT_GUARDRAIL_INPUT_REDACTED = 'GUARDRAIL_INPUT_REDACTED';

// ─── Admin events (future RBAC) ───
export const AUDIT_ADMIN_ROLE_CHANGE = 'ADMIN_ROLE_CHANGE';
export const AUDIT_ADMIN_REPORT_RESOLVED = 'ADMIN_REPORT_RESOLVED';
// ─── Admin user lifecycle (P0 #9 admin user detail — audit-2026-05-12) ───
export const AUDIT_ADMIN_USER_SUSPENDED = 'ADMIN_USER_SUSPENDED';
export const AUDIT_ADMIN_USER_UNSUSPENDED = 'ADMIN_USER_UNSUSPENDED';
export const AUDIT_ADMIN_USER_DELETED = 'ADMIN_USER_DELETED';
// R1 (C6) — admin tier override on `users.tier`. Emitted by `ChangeUserTierUseCase`
// AFTER mutation, BEFORE returning (N3 ordering). Metadata = `{ from, to }`;
// no counter state (N9 R2: state on user row, audit carries transition only).
export const AUDIT_ADMIN_USER_TIER_CHANGED = 'ADMIN_USER_TIER_CHANGED';
// ─── Admin CSV export (R2 W3.4) ───
// Distinct from AUDIT_DATA_EXPORT (user-self DSAR) — mixing breaks audit-chain
// filter semantics. Per-kind constants make `WHERE action =` trivial.
export const AUDIT_ADMIN_EXPORT_SESSIONS = 'ADMIN_EXPORT_SESSIONS';
export const AUDIT_ADMIN_EXPORT_REVIEWS = 'ADMIN_EXPORT_REVIEWS';
export const AUDIT_ADMIN_EXPORT_TICKETS = 'ADMIN_EXPORT_TICKETS';

// ─── Support ticket events ───
export const AUDIT_SUPPORT_TICKET_CREATED = 'SUPPORT_TICKET_CREATED';
export const AUDIT_ADMIN_TICKET_UPDATED = 'ADMIN_TICKET_UPDATED';

// ─── Review moderation events ───
export const AUDIT_ADMIN_REVIEW_MODERATED = 'ADMIN_REVIEW_MODERATED';

// ─── MFA events (R16, SOC2 CC6.1) ───
export const AUDIT_MFA_ENROLL_STARTED = 'MFA_ENROLL_STARTED';
export const AUDIT_MFA_ENROLL_VERIFIED = 'MFA_ENROLL_VERIFIED';
export const AUDIT_MFA_DISABLED = 'MFA_DISABLED';
export const AUDIT_MFA_CHALLENGE_SUCCESS = 'MFA_CHALLENGE_SUCCESS';
export const AUDIT_MFA_CHALLENGE_FAILED = 'MFA_CHALLENGE_FAILED';
export const AUDIT_MFA_RECOVERY_USED = 'MFA_RECOVERY_USED';
export const AUDIT_MFA_WARNING_STARTED = 'MFA_WARNING_STARTED';

// ─── GDPR consent events (S4-P0-02 — Apple Guideline 5.1.2(i) + GDPR Art. 7) ───
// Hash-chained row from GrantConsentUseCase/RevokeConsentUseCase after
// user_consents mutation, before HTTP response. Payload: `{ scope, version,
// source }` min; third-party AI rows add `{ provider, category }`. Generic
// CONSENT_GRANTED/CONSENT_REVOKED catches scopes outside specialised families.
export const AUDIT_CONSENT_GRANTED = 'CONSENT_GRANTED';
export const AUDIT_CONSENT_REVOKED = 'CONSENT_REVOKED';
export const AUDIT_CONSENT_GRANTED_TOS = 'CONSENT_GRANTED_TOS';
export const AUDIT_CONSENT_GRANTED_THIRD_PARTY_AI = 'CONSENT_GRANTED_THIRD_PARTY_AI';
export const AUDIT_CONSENT_REVOKED_THIRD_PARTY_AI = 'CONSENT_REVOKED_THIRD_PARTY_AI';
export const AUDIT_CONSENT_GRANTED_LOCATION_TO_LLM = 'CONSENT_GRANTED_LOCATION_TO_LLM';
export const AUDIT_CONSENT_REVOKED_LOCATION_TO_LLM = 'CONSENT_REVOKED_LOCATION_TO_LLM';
