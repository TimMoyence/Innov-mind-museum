/**
 * R1 — Test factory for `PaywallInterestPayload`.
 *
 * The R1 use case `submitPaywallInterest.useCase.ts` reuses the R3
 * `BetaSignupNotifier` port (D9 chosen option : single port, optional `source`
 * field). This factory builds the wire payload accepted by the new route
 * `POST /api/leads/paywall-interest` — identical shape to the beta signup
 * payload PLUS the `source: 'paywall_premium_interest'` discriminator that
 * differentiates Brevo contact attributes (R1 §1 R19, D9).
 *
 * Per CLAUDE.md §Test Discipline — DRY Factories : inline domain objects in
 * tests are forbidden. Every new R1 test under `tests/unit/leads/` and
 * `tests/unit/routes/leads-paywall*.test.ts` MUST use this factory.
 */

/** Sources accepted by the widened BetaSignupNotifier port (R1 §3.9 D9). */
export type LeadOptInSource = 'landing_beta_waitlist' | 'paywall_premium_interest';

/** Payload accepted by `POST /api/leads/paywall-interest` (R1 §1 R18). */
export interface PaywallInterestPayload {
  email: string;
  consent: true;
  /** Honeypot — must be empty for a non-spam submission (R1 §1 R23). */
  website?: string;
  ip?: string;
  requestId?: string;
  userAgent?: string;
  /**
   * Differentiates Brevo `OPT_IN_SOURCE` attribute vs R3's
   * `landing_beta_waitlist`. The route always injects
   * `'paywall_premium_interest'` ; the field is wire-optional only so the
   * factory can model misuse cases under test (default override).
   */
  source?: LeadOptInSource;
}

/**
 * Builds a valid paywall-interest payload. Overrides let tests flip ONE
 * field at a time without re-declaring the whole shape (DRY discipline).
 * @param overrides - Partial payload override; merged on top of the defaults.
 * @returns A fully-formed valid `PaywallInterestPayload` with overrides applied.
 */
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
