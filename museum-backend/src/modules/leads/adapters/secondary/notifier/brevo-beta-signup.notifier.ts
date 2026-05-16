import { logger } from '@shared/logger/logger';

import type {
  BetaSignupNotifier,
  BetaSignupOutcome,
  BetaSignupPayload,
} from '@modules/leads/domain/ports/beta-signup-notifier.port';

/** Brevo `POST /v3/contacts` endpoint (R3 §3.4). */
const BREVO_CONTACTS_ENDPOINT = 'https://api.brevo.com/v3/contacts';

/**
 * Brevo-backed beta-signup notifier (R3 §3.4).
 *
 * Calls the Brevo `POST /v3/contacts` API directly — NOT a reuse of
 * `BrevoEmailService` (which only exposes `sendEmail` for transactional mail).
 *
 * Outcomes :
 *  - 2xx → `{ outcome: 'subscribed' }`
 *  - 400 with body `code: "duplicate_parameter"` → `{ outcome: 'duplicate' }`
 *    (R16 idempotent anti-enumeration).
 *  - any other non-2xx → throws an Error with status + truncated body slice
 *    (R15). The api key is NEVER included in the error message.
 */
export class BrevoBetaSignupNotifier implements BetaSignupNotifier {
  constructor(
    private readonly apiKey: string,
    private readonly listId: number,
  ) {}

  /** Subscribes one email to the configured Brevo waitlist. */
  async subscribe(payload: BetaSignupPayload): Promise<{ outcome: BetaSignupOutcome }> {
    const response = await fetch(BREVO_CONTACTS_ENDPOINT, {
      method: 'POST',
      headers: {
        'api-key': this.apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        email: payload.email,
        listIds: [this.listId],
        // Idempotent add-or-update so re-submits don't error on existing
        // contacts in the standard path.
        updateEnabled: true,
        attributes: {
          OPT_IN: true,
          OPT_IN_AT: new Date().toISOString(),
          // R1 §3.9 D9 — per-call funnel cohort discriminator. R3 callers omit
          // `source` → backward-compat default `'landing_beta_waitlist'`. R1
          // `submitPaywallInterest.useCase` passes `'paywall_premium_interest'`.
          OPT_IN_SOURCE: payload.source ?? 'landing_beta_waitlist',
        },
      }),
    });

    if (response.ok) {
      return { outcome: 'subscribed' };
    }

    const bodyText = await response.text().catch(() => '');

    // R16 — Brevo signals "already on list" via 400 + code: "duplicate_parameter".
    // Treat as idempotent success so the route handler returns 202 and no
    // enumeration signal leaks to the wire.
    if (response.status === 400 && bodyText.includes('duplicate_parameter')) {
      logger.info('beta_signup_already_subscribed', {
        requestId: payload.requestId,
        emailDomain: payload.email.split('@')[1] ?? 'unknown',
      });
      return { outcome: 'duplicate' };
    }

    // R15 — anything else is an error the route maps to 5xx. Slice the body so
    // a huge HTML error page doesn't end up in the log. The api key is NEVER
    // appended to the error message.
    throw new Error(
      `Brevo contacts add failed (${String(response.status)}): ${bodyText.slice(0, 800)}`,
    );
  }
}

/**
 * No-op notifier used when Brevo credentials are absent (R14 — local dev,
 * pre-prod boot before the list ID is provisioned). Resolves silently with a
 * `noop` outcome so the route still returns 202 and structured logs surface a
 * warning the operator can monitor.
 */
export class NoopBetaSignupNotifier implements BetaSignupNotifier {
  /** Returns `noop` without performing any network call. */
  subscribe(payload: BetaSignupPayload): Promise<{ outcome: BetaSignupOutcome }> {
    logger.warn('beta_signup_notifier_noop', {
      requestId: payload.requestId,
      emailDomain: payload.email.split('@')[1] ?? 'unknown',
    });
    return Promise.resolve({ outcome: 'noop' });
  }
}
