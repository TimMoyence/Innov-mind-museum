export type BetaSignupOutcome = 'subscribed' | 'duplicate' | 'noop' | 'deleted' | 'not_found';

export type BetaSignupOptInSource = 'landing_beta_waitlist' | 'paywall_premium_interest';

export interface BetaSignupPayload {
  email: string;
  consent: true;
  website?: string;
  ip?: string;
  requestId?: string;
  userAgent?: string;
  source?: BetaSignupOptInSource;
}

export interface BetaSignupNotifier {
  subscribe(payload: BetaSignupPayload): Promise<{ outcome: BetaSignupOutcome } | void>;

  removeContact?(email: string): Promise<{ outcome: BetaSignupOutcome } | void>;
}
