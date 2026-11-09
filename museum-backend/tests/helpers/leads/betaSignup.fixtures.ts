export interface BetaSignupPayload {
  email: string;
  consent: true;
  website?: string;
  ip?: string;
  requestId?: string;
  userAgent?: string;
}

export function makeBetaSignupPayload(
  overrides: Partial<BetaSignupPayload> = {},
): BetaSignupPayload {
  return {
    email: 'visitor@example.com',
    consent: true,
    website: '',
    ...overrides,
  };
}
