import { httpRequest } from '@/shared/api/httpRequest';

import {
  CONSENT_POLICY_VERSION,
  type ThirdPartyAiScope,
} from '@/features/chat/domain/consentScopes';

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

export const consentApi = {
  async list(): Promise<ConsentRow[]> {
    const res = await httpRequest<ListConsentResponse>('/api/auth/consent', {
      method: 'GET',
      requiresAuth: true,
    });
    return res.consents;
  },

  async grant(scope: ThirdPartyAiScope, version: string = CONSENT_POLICY_VERSION): Promise<void> {
    await httpRequest<GrantConsentResponse>('/api/auth/consent', {
      method: 'POST',
      requiresAuth: true,
      body: { scope, version },
    });
  },

  async revoke(scope: ThirdPartyAiScope): Promise<void> {
    await httpRequest<RevokeConsentResponse>(`/api/auth/consent/${scope}`, {
      method: 'DELETE',
      requiresAuth: true,
    });
  },
};
