import { httpRequest } from '@/shared/api/httpRequest';

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
 * (`third_party_ai_*_{openai,google}`). `location_to_llm` is the exception:
 * it is a **coarse-location data-sharing** scope (city/country only), not a
 * per-LLM-vendor grant. It gates whether the BE propagates the visitor's
 * resolved coarse location into the LLM prompt (`location-resolver.ts`
 * `isGranted(userId, 'location_to_llm')`). It rides this array so the existing
 * grant/revoke wiring (`grant/revokeConsentScope`, the Settings revoke row map,
 * the `ThirdPartyAiScope` union) is reused unchanged (matches the BE
 * free-form-VARCHAR `CONSENT_SCOPES`), but the consent sheet renders it in its
 * own "Location" group, not under the OpenAI/Google provider grid.
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

interface ConsentRow {
  id: number;
  scope: string;
  version: string;
  grantedAt: string;
  revokedAt: string | null;
  source: string;
}

interface ListConsentResponse {
  consents: ConsentRow[];
}

interface GrantConsentResponse {
  consent: {
    id: number;
    scope: string;
    version: string;
    grantedAt: string;
    source: string;
  };
}

interface RevokeConsentResponse {
  revoked: true;
  scope: string;
}

/** GET /api/auth/consent — returns all rows (active + revoked) for the user. */
export const listUserConsents = async (): Promise<ConsentRow[]> => {
  const res = await httpRequest<ListConsentResponse>('/api/auth/consent', {
    method: 'GET',
    requiresAuth: true,
  });
  return res.consents;
};

/** POST /api/auth/consent — records a new active grant + audit row. */
export const grantConsentScope = async (
  scope: ThirdPartyAiScope,
  version: string = CONSENT_POLICY_VERSION,
): Promise<void> => {
  await httpRequest<GrantConsentResponse>('/api/auth/consent', {
    method: 'POST',
    requiresAuth: true,
    body: { scope, version },
  });
};

/** DELETE /api/auth/consent/:scope — stamps `revokedAt` + audit row when active. */
export const revokeConsentScope = async (scope: ThirdPartyAiScope): Promise<void> => {
  await httpRequest<RevokeConsentResponse>(`/api/auth/consent/${scope}`, {
    method: 'DELETE',
    requiresAuth: true,
  });
};
