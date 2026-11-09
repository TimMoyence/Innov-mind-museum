export const BREACH_EVENTS = {
  JWT_SECRET_LEAKED: 'breach_jwt_secret_leaked',
  DB_COMPROMISE: 'breach_db_compromise',
  S3_LEAK: 'breach_s3_leak',
  OAUTH_BYPASS: 'breach_oauth_bypass',
  LLM_API_KEY_ABUSE: 'breach_llm_api_key_abuse',
  SUPPLY_CHAIN: 'breach_supply_chain',
} as const;

export type BreachEventName = (typeof BREACH_EVENTS)[keyof typeof BREACH_EVENTS];

export const BREACH_EVENT_SET: ReadonlySet<string> = new Set<string>(Object.values(BREACH_EVENTS));
