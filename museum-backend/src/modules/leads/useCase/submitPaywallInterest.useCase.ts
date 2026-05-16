import { badRequest } from '@shared/errors/app.error';
import { logger } from '@shared/logger/logger';
import { validateEmail } from '@shared/validation/email';

import type {
  BetaSignupNotifier,
  BetaSignupOutcome,
  BetaSignupPayload,
} from '@modules/leads/domain/ports/beta-signup-notifier.port';

/**
 * R1 (C6) — Paywall email-capture use case. Mirrors `SubmitBetaSignupUseCase`
 * (R3) but tags the Brevo contact with `OPT_IN_SOURCE='paywall_premium_interest'`
 * so the funnel-side cohort analytics can differentiate landing-beta vs
 * paywall-driven signups (R1 §0.1 + §3.9 D9). Reuses the same
 * `BetaSignupNotifier` port + Brevo adapter — no new adapter, no new env var.
 *
 * Validation matches R3 doctrine : explicit `consent === true` literal,
 * trimmed-lowercased email, honeypot silent-drop, PII discipline on logs
 * (full email NEVER logged — only the domain after `@`).
 */
interface SubmitPaywallInterestInput {
  email: string;
  consent: boolean;
  website?: string;
  ip?: string;
  requestId?: string;
  userAgent?: string;
}

/** Wraps a `BetaSignupNotifier` to capture paywall-driven premium interest. */
export class SubmitPaywallInterestUseCase {
  constructor(private readonly notifier: BetaSignupNotifier) {}

  /** Validates the payload, applies the cohort discriminator, forwards to the notifier. */
  async execute(input: SubmitPaywallInterestInput): Promise<void> {
    if (!input.consent) {
      throw badRequest('consent must be true');
    }

    const email = input.email.trim().toLowerCase();
    if (!validateEmail(email)) {
      throw badRequest('email must be valid');
    }

    // R23 — honeypot silent drop (mirror R3 R10). Whitespace-only does NOT
    // trigger the drop (password-manager autofill safety).
    if (typeof input.website === 'string' && input.website.trim().length > 0) {
      logger.warn('paywall_interest_honeypot_triggered', {
        requestId: input.requestId,
        hasIp: Boolean(input.ip),
      });
      return;
    }

    const payload: BetaSignupPayload = {
      email,
      consent: true,
      website: input.website,
      ip: input.ip,
      requestId: input.requestId,
      userAgent: input.userAgent,
      // R19 — funnel cohort discriminator. The Brevo adapter forwards this
      // verbatim as `OPT_IN_SOURCE`. Hardcoded literal here — the route
      // never reads it from the wire (only from the use case).
      source: 'paywall_premium_interest',
    };

    const outcome = await this.notifier.subscribe(payload);
    const brevoOutcome: BetaSignupOutcome | 'unknown' =
      outcome && 'outcome' in outcome ? outcome.outcome : 'unknown';

    // R21 — structured log with requestId + emailDomain + brevoOutcome. Full
    // email value MUST NOT appear (PII discipline ; mirror R3 R17).
    const emailDomain = email.split('@')[1] ?? 'unknown';
    logger.info('paywall_email_captured', {
      requestId: input.requestId,
      emailDomain,
      brevoOutcome,
    });
  }
}
