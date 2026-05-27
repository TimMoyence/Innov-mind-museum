/**
 * Consent scopes round-tripped to `/api/auth/consent` — must match
 * `museum-backend/src/modules/auth/domain/consent/userConsent.entity.ts
 * CONSENT_SCOPES`. Hardcoded duplicate because the BE OpenAPI spec doesn't
 * expose `/api/auth/consent` yet (the generated client at
 * `shared/api/generated/openapi.ts` has no entry).
 *
 * S4-P0-02 (Apple Guideline 5.1.2(i)) — every scope here represents one
 * explicit, separate, non-bundled grant. DeepSeek scopes intentionally
 * omitted ; blocked in EU prod by S4-P0-04 sentinel.
 *
 * NOTE — most scopes are per-vendor third-party-AI grants
 * (`third_party_ai_*_{openai,google}`). The two geo scopes are the exceptions:
 * they gate whether the BE propagates the visitor's resolved location into the
 * LLM prompt (`location-resolver.ts:214-251`), at two distinct precisions:
 *   - `location_to_llm` = **full / neighbourhood** : the BE emits
 *     `<neighbourhood>, <city>` (`buildNeighbourhoodReverseGeocode`) — finer
 *     than the city, never street/address/coordinates. `full` dominates: if it
 *     is granted, the coarse scope is never consulted.
 *   - `location_coarse_to_llm` = **coarse / city + country** : the BE emits
 *     `<city>, <country>` only (`buildCoarseReverseGeocode`) — a less precise
 *     option than neighbourhood (Cycle 1.5-FE, REQ-FE-1).
 * Both ride this array so the existing grant/revoke wiring (`consentApi`, the
 * Settings revoke row map, the `ThirdPartyAiScope` union) is reused unchanged
 * (matches the BE free-form-VARCHAR `CONSENT_SCOPES`). The consent sheet renders
 * them in their own "Location" group below the OpenAI/Google provider grid, and
 * treats them as mutually exclusive (D1 Option C — enabling one disables the
 * other) to avoid the misleading "both ON" state.
 *
 * C1 hexagonal (2026-05-23) — extracted from
 * `features/chat/application/thirdPartyAiConsent.ts` into a pure-data domain
 * module. The 3 HTTP functions migrated to
 * `features/chat/infrastructure/consentApi.ts` ; the original application-layer
 * file was deleted (UFR-016 dead-code burial).
 */
export const THIRD_PARTY_AI_SCOPES = [
  'third_party_ai_text_openai',
  'third_party_ai_image_openai',
  'third_party_ai_audio_openai',
  'third_party_ai_profile_openai',
  'third_party_ai_text_google',
  'third_party_ai_image_google',
  'third_party_ai_audio_google',
  'third_party_ai_profile_google',
  'location_to_llm',
  // Cycle 1.5-FE (REQ-FE-1, D2) — appended LAST so the existing 0-8 indices
  // stay stable (`switches[8] === location_to_llm`, NFR-FE-6 audit-chain).
  'location_coarse_to_llm',
] as const;

export type ThirdPartyAiScope = (typeof THIRD_PARTY_AI_SCOPES)[number];

/**
 * Mandatory scope without which the chat cannot function. Surfaced as
 * `(required)` in the consent sheet and gates the Save button there.
 * When the user revokes this scope from Settings, the AsyncStorage
 * "already asked" memo MUST be cleared so the consent sheet re-prompts
 * on the next chat session.
 */
export const REQUIRED_CONSENT_SCOPE: ThirdPartyAiScope = 'third_party_ai_text_openai';

/** Policy version anchor — keep in sync with `museum-backend/src/shared/legal/policy-version.ts`. */
export const CONSENT_POLICY_VERSION = '2026-06-01';
