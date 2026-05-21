/**
 * R3 §3.3 + §3.4 — parallel to `B2bLeadNotifier` (separate port: B2B = one-shot
 * email, beta = idempotent Brevo list subscription). `subscribe()` returns a
 * structured outcome so duplicate/noop surface to logs without leaking to wire
 * (R16 anti-enumeration). Route maps every outcome to 202.
 */

export type BetaSignupOutcome = 'subscribed' | 'duplicate' | 'noop' | 'deleted' | 'not_found';

/**
 * Forwarded to Brevo as `OPT_IN_SOURCE` for cohort segmentation.
 * R1 §3.9 D9 widened from hardcoded literal so `submitPaywallInterest.useCase`
 * can attach `paywall_premium_interest`.
 */
export type BetaSignupOptInSource = 'landing_beta_waitlist' | 'paywall_premium_interest';

/** R3 §3.4. */
export interface BetaSignupPayload {
  email: string;
  consent: true;
  /** Honeypot — must be empty for non-spam (R3 §1 R10). */
  website?: string;
  ip?: string;
  requestId?: string;
  userAgent?: string;
  /**
   * R1 (C6) — funnel cohort discriminator. Optional; R3 callers omit and
   * adapter defaults to `'landing_beta_waitlist'`.
   */
  source?: BetaSignupOptInSource;
}

/**
 * Return type is union of `void` and structured outcome so test doubles mock
 * with `Promise<void>` while prod adapters return `{ outcome }`. Use case
 * ignores outcome — all paths map to 202 (R16 anti-enumeration).
 */
export interface BetaSignupNotifier {
  subscribe(payload: BetaSignupPayload): Promise<{ outcome: BetaSignupOutcome } | void>;

  /**
   * GDPR Art.17 erasure (B2) — removes the user's marketing contact so they
   * stop receiving marketing. Idempotent: a 404 (contact never existed) resolves
   * as success (`not_found`). Other non-2xx throws WITHOUT leaking the api-key.
   * The Noop notifier resolves `{ outcome: 'noop' }` with no network call.
   *
   * Optional on the port so signup-only test doubles need not implement it; the
   * concrete adapters (`BrevoBetaSignupNotifier` / `NoopBetaSignupNotifier`)
   * always provide it, and the auth deletion proxy depends on a narrow
   * `{ removeContact(email) }` shape rather than the full notifier.
   */
  removeContact?(email: string): Promise<{ outcome: BetaSignupOutcome } | void>;
}
