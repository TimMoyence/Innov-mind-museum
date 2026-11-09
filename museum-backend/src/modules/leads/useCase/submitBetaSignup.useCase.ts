import { isEmail } from '@musaium/shared';

import { toSanitizedLeadError } from '@modules/leads/domain/lead/sanitizeLeadError';
import { invalidInput } from '@shared/errors/app.error';
import { logger } from '@shared/logger/logger';
import { judgeSubmission } from '@shared/validation/honeypot';

import type { ILeadRepository } from '@modules/leads/domain/lead/lead.repository.interface';
import type {
  BetaSignupNotifier,
  BetaSignupPayload,
} from '@modules/leads/domain/ports/beta-signup-notifier.port';

interface SubmitBetaSignupInput {
  email: string;
  consent: boolean;
  website?: string;
  fillMs?: number;
  ip?: string;
  requestId?: string;
  userAgent?: string;
}

export class SubmitBetaSignupUseCase {
  constructor(
    private readonly notifier: BetaSignupNotifier,
    private readonly repository: ILeadRepository,
  ) {}

  async execute(input: SubmitBetaSignupInput): Promise<void> {
    if (!input.consent) {
      throw invalidInput('consent must be true');
    }

    const email = input.email.trim().toLowerCase();
    if (!isEmail(email)) {
      throw invalidInput('email must be valid');
    }

    if (judgeSubmission(input) === 'bot') {
      logger.warn('beta_signup_honeypot_triggered', {
        requestId: input.requestId,
        hasIp: Boolean(input.ip),
      });
      return;
    }

    logger.info('beta_signup_submitted', {
      requestId: input.requestId,
      honeypotTriggered: false,
    });

    const payload: BetaSignupPayload = {
      email,
      consent: true,
      website: input.website,
      ip: input.ip,
      requestId: input.requestId,
      userAgent: input.userAgent,
    };

    const lead = await this.repository.insertPending({ type: 'beta', payload, dedupKey: null });
    logger.info('lead_persisted', {
      requestId: input.requestId,
      leadId: lead.id,
      type: 'beta',
    });

    try {
      await this.notifier.subscribe(payload);
      await this.repository.markDelivered(lead.id);
      logger.info('lead_delivered', { leadId: lead.id, type: 'beta' });
    } catch (err) {
      await this.repository.markFailed(lead.id, toSanitizedLeadError(err));
      logger.warn('lead_delivery_failed', {
        leadId: lead.id,
        type: 'beta',
        errorClass: err instanceof Error ? err.name : 'unknown',
      });
    }
  }
}
