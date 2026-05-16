import { httpRequest } from '@/shared/api/httpRequest';

/**
 * Third-party AI consent scopes — must match `museum-backend/src/modules/auth/
 * domain/consent/userConsent.entity.ts CONSENT_SCOPES`. Hardcoded duplicate
 * because the BE OpenAPI spec doesn't expose `/api/auth/consent` yet (the
 * generated client at `shared/api/generated/openapi.ts` has no entry).
 *
 * S4-P0-02 (Apple Guideline 5.1.2(i)) — every scope here represents one
 * explicit, separate, non-bundled grant. DeepSeek scopes intentionally
 * omitted ; blocked in EU prod by S4-P0-04 sentinel.
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
] as const;

export type ThirdPartyAiScope = (typeof THIRD_PARTY_AI_SCOPES)[number];

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
