import { logger } from '@shared/logger/logger';
import { extractEmailDomain } from '@shared/pii/extractEmailDomain';

import type {
  BetaSignupNotifier,
  BetaSignupOutcome,
  BetaSignupPayload,
} from '@modules/leads/domain/ports/beta-signup-notifier.port';

const BREVO_CONTACTS_ENDPOINT = 'https://api.brevo.com/v3/contacts';

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
        updateEnabled: true,
        attributes: {
          OPT_IN: true,
          OPT_IN_AT: new Date().toISOString(),
          OPT_IN_SOURCE: payload.source ?? 'landing_beta_waitlist',
        },
      }),
    });

    if (response.ok) {
      return { outcome: 'subscribed' };
    }

    const bodyText = await response.text().catch(() => '');

    if (response.status === 400 && bodyText.includes('duplicate_parameter')) {
      logger.info('beta_signup_already_subscribed', {
        requestId: payload.requestId,
        emailDomain: extractEmailDomain(payload.email),
      });
      return { outcome: 'duplicate' };
    }

    throw new Error(
      `Brevo contacts add failed (${String(response.status)}): ${bodyText.slice(0, 800)}`,
    );
  }

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

    if (response.status === 404) {
      logger.info('beta_signup_remove_contact_not_found', {
        emailDomain: extractEmailDomain(email),
      });
      return { outcome: 'not_found' };
    }

    const bodyText = await response.text().catch(() => '');
    throw new Error(
      `Brevo contact remove failed (${String(response.status)}): ${bodyText.slice(0, 800)}`,
    );
  }
}

export class NoopBetaSignupNotifier implements BetaSignupNotifier {
  subscribe(payload: BetaSignupPayload): Promise<{ outcome: BetaSignupOutcome }> {
    logger.warn('beta_signup_notifier_noop', {
      requestId: payload.requestId,
      emailDomain: extractEmailDomain(payload.email),
    });
    return Promise.resolve({ outcome: 'noop' });
  }

  removeContact(email: string): Promise<{ outcome: BetaSignupOutcome }> {
    logger.warn('beta_signup_remove_contact_noop', {
      emailDomain: extractEmailDomain(email),
    });
    return Promise.resolve({ outcome: 'noop' });
  }
}
