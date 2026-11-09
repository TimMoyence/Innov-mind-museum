import { httpClient } from '@/shared/infrastructure/httpClient';

export interface PaywallLeadPayload {
  email: string;
  consent: true;
  website: string;
}

export const leadsApi = {
  async submitPaywallInterest(payload: PaywallLeadPayload): Promise<void> {
    await httpClient.post('/api/leads/paywall-interest', payload);
  },
};
