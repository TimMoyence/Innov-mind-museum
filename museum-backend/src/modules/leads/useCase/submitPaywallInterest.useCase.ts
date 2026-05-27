import { toSanitizedLeadError } from '@modules/leads/domain/lead/sanitizeLeadError';
import { badRequest } from '@shared/errors/app.error';
import { logger } from '@shared/logger/logger';
import { extractEmailDomain } from '@shared/pii/extractEmailDomain';
import { validateEmail } from '@shared/validation/email';


import type { ILeadRepository } from '@modules/leads/domain/lead/lead.repository.interface';
import type {
  BetaSignupNotifier,
  BetaSignupOutcome,
  BetaSignupPayload,
} from '@modules/leads/domain/ports/beta-signup-notifier.port';

/**
 * R1 (C6) — paywall email capture. Mirrors `SubmitBetaSignupUseCase` (R3) but
 * tags Brevo contact with `OPT_IN_SOURCE='paywall_premium_interest'` (R1 §0.1
 * + §3.9 D9). Reuses `BetaSignupNotifier` port + Brevo adapter (no new
 * adapter / env var). Validation = R3 doctrine: literal consent, lowercased
 * email, honeypot silent-drop, full email NEVER logged.
 */
interface SubmitPaywallInterestInput {
  email: string;
  consent: boolean;
  website?: string;
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
      throw badRequest('consent must be true');
    }

    const email = input.email.trim().toLowerCase();
    if (!validateEmail(email)) {
      throw badRequest('email must be valid');
    }

    // R7/R23 — honeypot silent drop BEFORE any persistence. Whitespace-only NOT a hit.
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
      // R19 — funnel cohort. Hardcoded literal; route never reads from wire.
      source: 'paywall_premium_interest',
    };

    // R1 — persist `pending` BEFORE the notifier so a Brevo failure cannot lose
    // it (the `source` discriminator is persisted in the jsonb payload).
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

      // R2 — delivery confirmed → pending → delivered.
      await this.repository.markDelivered(lead.id);
      logger.info('lead_delivered', { leadId: lead.id, type: 'paywall' });

      // R21 — log requestId + emailDomain + brevoOutcome. Full email forbidden (R17 PII).
      logger.info('paywall_email_captured', {
        requestId: input.requestId,
        emailDomain,
        brevoOutcome,
      });
    } catch (err) {
      // R3/R5 — NEVER rethrow: the lead is durable; the retry job re-delivers it.
      // R16 — sanitise before persisting (no api-key, no full recipient email).
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
