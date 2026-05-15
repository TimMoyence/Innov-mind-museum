/**
 * Beta-signup outbound port (R3 §3.3 + §3.4).
 *
 * Parallel to `B2bLeadNotifier` — separate port because the semantics differ:
 *  - B2B leads are one-shot transactional emails to the founder inbox.
 *  - Beta signups are idempotent subscriptions to a Brevo contact list.
 *
 * The `subscribe()` method returns a structured outcome so the use case can
 * surface duplicate / noop signals to logs without leaking them to the wire
 * (R16 anti-enumeration). The route handler maps every outcome to a 202.
 */

/** Outcomes observable by the use case after a subscribe attempt. */
export type BetaSignupOutcome = 'subscribed' | 'duplicate' | 'noop';

/**
 * Opt-in source attribute forwarded to Brevo as `OPT_IN_SOURCE`. Used by the
 * marketing-automation rules to differentiate cohorts on the Brevo side.
 *
 * R1 §3.9 D9 — widened from a hardcoded literal to a typed union so the new
 * `submitPaywallInterest.useCase` can attach `paywall_premium_interest` while
 * R3 callers keep their existing `landing_beta_waitlist` default.
 */
export type BetaSignupOptInSource = 'landing_beta_waitlist' | 'paywall_premium_interest';

/** Payload delivered by the public beta-signup form (R3 §3.4). */
export interface BetaSignupPayload {
  email: string;
  consent: true;
  /** Honeypot — must be empty for a non-spam submission (R3 §1 R10). */
  website?: string;
  ip?: string;
  requestId?: string;
  userAgent?: string;
  /**
   * R1 (C6) — funnel cohort discriminator forwarded to Brevo as
   * `OPT_IN_SOURCE`. Optional ; R3 call sites omit it and the adapter
   * defaults to `'landing_beta_waitlist'` for backward compat.
   */
  source?: BetaSignupOptInSource;
}

/**
 * Outbound port used to subscribe an email to the beta waitlist.
 *
 * The return type is a union of `void` and the structured outcome so test
 * doubles (use-case unit tests) can mock with `Promise<void>` directly while
 * production adapters (Brevo / Noop) return a richer
 * `{ outcome: BetaSignupOutcome }` payload that their dedicated tests assert
 * on. The use case ignores the outcome — all paths map to a 202 at the route
 * layer (R16 anti-enumeration).
 */
export interface BetaSignupNotifier {
  subscribe(payload: BetaSignupPayload): Promise<{ outcome: BetaSignupOutcome } | void>;
}
