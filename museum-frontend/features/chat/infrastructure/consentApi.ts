import { httpRequest } from '@/shared/api/httpRequest';

import {
  CONSENT_POLICY_VERSION,
  type ThirdPartyAiScope,
} from '@/features/chat/domain/consentScopes';
import type { components, paths } from '@/shared/api/generated/openapi';

export type ConsentListItem = components['schemas']['ConsentListItem'];

type ListConsentResponse =
  paths['/api/auth/consent']['get']['responses'][200]['content']['application/json'];
type GrantConsentResponse =
  paths['/api/auth/consent']['post']['responses'][201]['content']['application/json'];
type RevokeConsentResponse =
  paths['/api/auth/consent/{scope}']['delete']['responses'][200]['content']['application/json'];

export const consentApi = {
  async list(): Promise<ConsentListItem[]> {
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
