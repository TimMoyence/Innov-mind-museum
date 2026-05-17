/**
 * Canonical breach event names — one per containment runbook in
 * `docs/incidents/BREACH_PLAYBOOK.md` § 5. Use ONLY these when calling
 * {@link AuditService.auditCriticalSecurityEvent}. Free-form `breach_*` not
 * allowed: every breach must map to a documented runbook.
 *
 * New scenario requires: (1) constant here (snake_case, ≤ 64 chars =
 * audit_logs.action VARCHAR(64)); (2) new §5.x runbook in BREACH_PLAYBOOK.md;
 * (3) severity mapping passed by caller.
 */
export const BREACH_EVENTS = {
  /** § 5.a — JWT signing secret leaked (e.g., committed to git). */
  JWT_SECRET_LEAKED: 'breach_jwt_secret_leaked',
  /** § 5.b — Database compromise / SQL injection. */
  DB_COMPROMISE: 'breach_db_compromise',
  /** § 5.c — S3 / object-storage leak. */
  S3_LEAK: 'breach_s3_leak',
  /** § 5.d — OAuth bypass (Google / Apple JWKS misuse). */
  OAUTH_BYPASS: 'breach_oauth_bypass',
  /** § 5.e — OpenAI / LLM API key abuse, cost spike, prompt-injection campaign. */
  LLM_API_KEY_ABUSE: 'breach_llm_api_key_abuse',
  /** § 5.f — Supply-chain compromise (npm package, container image). */
  SUPPLY_CHAIN: 'breach_supply_chain',
} as const;

export type BreachEventName = (typeof BREACH_EVENTS)[keyof typeof BREACH_EVENTS];

/** Runtime guard against free-form `breach_*` strings. */
export const BREACH_EVENT_SET: ReadonlySet<string> = new Set<string>(Object.values(BREACH_EVENTS));
