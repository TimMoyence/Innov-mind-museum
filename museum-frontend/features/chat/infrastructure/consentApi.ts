import { httpRequest } from '@/shared/api/httpRequest';

import {
  CONSENT_POLICY_VERSION,
  type ThirdPartyAiScope,
} from '@/features/chat/domain/consentScopes';

/**
 * Active or revoked consent row as returned by `GET /api/auth/consent`.
 *
 * TODO swap to `OpenApiResponseFor<…>` when the BE OpenAPI spec exposes
 * `/api/auth/consent` (currently absent from `shared/api/generated/openapi.ts`).
 */
export interface ConsentRow {
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

/**
 * Third-party-AI consent façade.
 *
 * C1 hexagonal (2026-05-23) — extracted from
 * `features/chat/application/thirdPartyAiConsent.ts`. Application layer
 * (`useAiConsent`) and UI layer (`SettingsAiConsentCard`) MUST go through
 * this service.
 *
 * REQ-C1-009 (Apple Guideline 5.1.2(i) — App Store) — `grant(scope, version?)`
 * sends exactly ONE POST per call. No batching API exposed — the caller's
 * `for...of scopes` loop is the audit-chain ordering contract.
 */
export const consentApi = {
  /** GET /api/auth/consent — returns all rows (active + revoked) for the user. */
  async list(): Promise<ConsentRow[]> {
    const res = await httpRequest<ListConsentResponse>('/api/auth/consent', {
      method: 'GET',
      requiresAuth: true,
    });
    return res.consents;
  },

  /**
   * POST /api/auth/consent — records a new active grant + hash-chained audit row.
   *
   * @param scope - Single third-party-AI scope to grant.
   * @param version - Policy version anchor ; defaults to `CONSENT_POLICY_VERSION`.
   */
  async grant(scope: ThirdPartyAiScope, version: string = CONSENT_POLICY_VERSION): Promise<void> {
    await httpRequest<GrantConsentResponse>('/api/auth/consent', {
      method: 'POST',
      requiresAuth: true,
      body: { scope, version },
    });
  },

  /** DELETE /api/auth/consent/:scope — stamps `revokedAt` + audit row when active. */
  async revoke(scope: ThirdPartyAiScope): Promise<void> {
    await httpRequest<RevokeConsentResponse>(`/api/auth/consent/${scope}`, {
      method: 'DELETE',
      requiresAuth: true,
    });
  },
};
