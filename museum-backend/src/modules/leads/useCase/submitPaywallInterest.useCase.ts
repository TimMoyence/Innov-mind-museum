import { isEmail } from '@musaium/shared';

import { toSanitizedLeadError } from '@modules/leads/domain/lead/sanitizeLeadError';
import { invalidInput } from '@shared/errors/app.error';
import { logger } from '@shared/logger/logger';
import { extractEmailDomain } from '@shared/pii/extractEmailDomain';
import { judgeSubmission } from '@shared/validation/honeypot';

import type { ILeadRepository } from '@modules/leads/domain/lead/lead.repository.interface';
import type {
  BetaSignupNotifier,
  BetaSignupOutcome,
  BetaSignupPayload,
} from '@modules/leads/domain/ports/beta-signup-notifier.port';

interface SubmitPaywallInterestInput {
  email: string;
  consent: boolean;
  website?: string;
  fillMs?: number;
  ip?: string;
  requestId?: string;
  userAgent?: string;
}

export class SubmitPaywallInterestUseCase {
  constructor(
    private readonly notifier: BetaSignupNotifier,
    private readonly repository: ILeadRepository,
  ) {}

  async execute(input: SubmitPaywallInterestInput): Promise<void> {
    if (!input.consent) {
      throw invalidInput('consent must be true');
    }

    const email = input.email.trim().toLowerCase();
    if (!isEmail(email)) {
      throw invalidInput('email must be valid');
    }

    if (judgeSubmission(input) === 'bot') {
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
      source: 'paywall_premium_interest',
    };

    const lead = await this.repository.insertPending({ type: 'paywall', payload, dedupKey: null });
    logger.info('lead_persisted', {
      requestId: input.requestId,
      leadId: lead.id,
      type: 'paywall',
    });

    const emailDomain = extractEmailDomain(email);

    try {
      const outcome = await this.notifier.subscribe(payload);
      const brevoOutcome: BetaSignupOutcome | 'unknown' =
        outcome && 'outcome' in outcome ? outcome.outcome : 'unknown';

      await this.repository.markDelivered(lead.id);
      logger.info('lead_delivered', { leadId: lead.id, type: 'paywall' });

      logger.info('paywall_email_captured', {
        requestId: input.requestId,
        emailDomain,
        brevoOutcome,
      });
    } catch (err) {
      await this.repository.markFailed(lead.id, toSanitizedLeadError(err));
      logger.warn('lead_delivery_failed', {
        leadId: lead.id,
        type: 'paywall',
        emailDomain,
        errorClass: err instanceof Error ? err.name : 'unknown',
      });
    }
  }
}
