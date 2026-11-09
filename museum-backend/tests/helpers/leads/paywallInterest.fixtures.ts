export type LeadOptInSource = 'landing_beta_waitlist' | 'paywall_premium_interest';

export interface PaywallInterestPayload {
  email: string;
  consent: true;
  website?: string;
  ip?: string;
  requestId?: string;
  userAgent?: string;
  source?: LeadOptInSource;
}

export function makePaywallInterestPayload(
  overrides: Partial<PaywallInterestPayload> = {},
): PaywallInterestPayload {
  return {
    email: 'free-tier@example.com',
    consent: true,
    website: '',
    source: 'paywall_premium_interest',
    ...overrides,
  };
}
