import { isEmail } from '@musaium/shared';

import { deliverLead } from '@modules/leads/useCase/deliver-lead';
import { invalidInput } from '@shared/errors/app.error';
import { logger } from '@shared/logger/logger';
import { extractEmailDomain } from '@shared/pii/extractEmailDomain';
import { screenSubmission } from '@shared/validation/screen-submission';

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

    if (screenSubmission(input, 'paywall_interest') === 'bot') return;

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

    const delivery = await deliverLead({
      repository: this.repository,
      lead,
      send: () => this.notifier.subscribe(payload),
      failureContext: { emailDomain },
    });
    if (delivery.delivered) {
      const { outcome } = delivery;
      const brevoOutcome: BetaSignupOutcome | 'unknown' =
        outcome && 'outcome' in outcome ? outcome.outcome : 'unknown';
      logger.info('paywall_email_captured', {
        requestId: input.requestId,
        emailDomain,
        brevoOutcome,
      });
    }
  }
}
