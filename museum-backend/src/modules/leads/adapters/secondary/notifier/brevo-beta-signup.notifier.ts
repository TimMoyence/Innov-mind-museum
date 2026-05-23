import { logger } from '@shared/logger/logger';
import { extractEmailDomain } from '@shared/pii/extractEmailDomain';

import type {
  BetaSignupNotifier,
  BetaSignupOutcome,
  BetaSignupPayload,
} from '@modules/leads/domain/ports/beta-signup-notifier.port';

/** Brevo `POST /v3/contacts` endpoint (R3 §3.4). */
const BREVO_CONTACTS_ENDPOINT = 'https://api.brevo.com/v3/contacts';

/**
 * R3 §3.4 — calls Brevo `POST /v3/contacts` directly (NOT `BrevoEmailService`,
 * which only does transactional mail).
 *
 * Outcomes:
 *  - 2xx → `subscribed`
 *  - 400 + body `code: "duplicate_parameter"` → `duplicate` (R16 idempotent
 *    anti-enumeration).
 *  - other non-2xx → throws with status + body slice (R15); api key NEVER in error.
 */
export class BrevoBetaSignupNotifier implements BetaSignupNotifier {
  constructor(
    private readonly apiKey: string,
    private readonly listId: number,
  ) {}

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
        // Idempotent add-or-update so re-submits don't error on existing contacts.
        updateEnabled: true,
        attributes: {
          OPT_IN: true,
          OPT_IN_AT: new Date().toISOString(),
          // R1 §3.9 D9 — funnel cohort. R3 callers omit `source` → default
          // `'landing_beta_waitlist'`. Paywall use case passes `'paywall_premium_interest'`.
          OPT_IN_SOURCE: payload.source ?? 'landing_beta_waitlist',
        },
      }),
    });

    if (response.ok) {
      return { outcome: 'subscribed' };
    }

    const bodyText = await response.text().catch(() => '');

    // R16 — Brevo signals "already on list" via 400 + code: "duplicate_parameter".
    // Treat as idempotent success (route returns 202, no enumeration leak).
    if (response.status === 400 && bodyText.includes('duplicate_parameter')) {
      logger.info('beta_signup_already_subscribed', {
        requestId: payload.requestId,
        emailDomain: extractEmailDomain(payload.email),
      });
      return { outcome: 'duplicate' };
    }

    // R15 — slice body to avoid huge HTML pages in logs. api key NEVER appended.
    throw new Error(
      `Brevo contacts add failed (${String(response.status)}): ${bodyText.slice(0, 800)}`,
    );
  }

  /**
   * GDPR Art.17 erasure (B2, R4–R6) — `DELETE /v3/contacts/{email}?identifierType=email_id`.
   *
   * Outcomes:
   *  - 2xx / 204 → `deleted`
   *  - 404 (contact never existed) → `not_found` (idempotent success, no throw, no error log)
   *  - other non-2xx → throws with status + body slice; api-key NEVER appended.
   */
  async removeContact(email: string): Promise<{ outcome: BetaSignupOutcome }> {
    const url = `${BREVO_CONTACTS_ENDPOINT}/${encodeURIComponent(email)}?identifierType=email_id`;
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'api-key': this.apiKey,
        Accept: 'application/json',
      },
    });

    if (response.ok) {
      return { outcome: 'deleted' };
    }

    // R5 — Brevo returns 404 when the contact does not exist. Erasure is
    // idempotent: nothing to remove is success, not an error.
    if (response.status === 404) {
      logger.info('beta_signup_remove_contact_not_found', {
        emailDomain: extractEmailDomain(email),
      });
      return { outcome: 'not_found' };
    }

    const bodyText = await response.text().catch(() => '');
    // R6 / security — slice body; api-key NEVER appended to the error message.
    throw new Error(
      `Brevo contact remove failed (${String(response.status)}): ${bodyText.slice(0, 800)}`,
    );
  }
}

/**
 * R14 — used when Brevo creds absent (local dev, pre-prod). Resolves silently
 * with `noop`; route still returns 202; structured log surfaces a warning.
 */
export class NoopBetaSignupNotifier implements BetaSignupNotifier {
  subscribe(payload: BetaSignupPayload): Promise<{ outcome: BetaSignupOutcome }> {
    logger.warn('beta_signup_notifier_noop', {
      requestId: payload.requestId,
      emailDomain: extractEmailDomain(payload.email),
    });
    return Promise.resolve({ outcome: 'noop' });
  }

  /** GDPR erasure (B2, R6) — no Brevo creds, so nothing to remove; resolves noop. */
  removeContact(email: string): Promise<{ outcome: BetaSignupOutcome }> {
    logger.warn('beta_signup_remove_contact_noop', {
      emailDomain: extractEmailDomain(email),
    });
    return Promise.resolve({ outcome: 'noop' });
  }
}
