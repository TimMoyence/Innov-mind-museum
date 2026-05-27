import { toSanitizedLeadError } from '@modules/leads/domain/lead/sanitizeLeadError';
import { badRequest } from '@shared/errors/app.error';
import { logger } from '@shared/logger/logger';
import { validateEmail } from '@shared/validation/email';


import type { ILeadRepository } from '@modules/leads/domain/lead/lead.repository.interface';
import type {
  BetaSignupNotifier,
  BetaSignupPayload,
} from '@modules/leads/domain/ports/beta-signup-notifier.port';

/**
 * Superset of wire payload (incl. request metadata). `consent` widened to
 * `boolean` so the R11 runtime check is type-honest.
 */
interface SubmitBetaSignupInput {
  email: string;
  consent: boolean;
  website?: string;
  ip?: string;
  requestId?: string;
  userAgent?: string;
}

/**
 * Persist-then-notify (Cycle B « Aucun lead perdu », spec R1/R2/R3/R5/R7): the
 * validated lead is persisted `pending` BEFORE the Brevo `subscribe` call, so a
 * Brevo runtime failure never loses it (the row survives as `failed`,
 * recoverable by the retry job). The use-case does NOT rethrow on failure — the
 * route answers 202 regardless of the delivery outcome (R5). Beta keeps Brevo's
 * own idempotence (`updateEnabled` / `duplicate_parameter`), so `dedupKey` is
 * null (no local dedup).
 *
 * R7 honeypot — non-empty `website` after trim → SILENT drop (no persist, no
 * notify; BE timing matches a legit submission). Whitespace-only NOT a hit
 * (password-manager autofill). R17 PII — full email NEVER logged.
 */
export class SubmitBetaSignupUseCase {
  constructor(
    private readonly notifier: BetaSignupNotifier,
    private readonly repository: ILeadRepository,
  ) {}

  async execute(input: SubmitBetaSignupInput): Promise<void> {
    // R11 — consent must be literally true even if wire schema skipped (direct curl).
    if (!input.consent) {
      throw badRequest('consent must be true');
    }

    const email = input.email.trim().toLowerCase();
    if (!validateEmail(email)) {
      throw badRequest('email must be valid');
    }

    // R7 — honeypot silent drop BEFORE any persistence. Whitespace-only NOT a hit.
    if (typeof input.website === 'string' && input.website.trim().length > 0) {
      logger.warn('beta_signup_honeypot_triggered', {
        requestId: input.requestId,
        hasIp: Boolean(input.ip),
      });
      return;
    }

    // R17 — no full email (PII). Notifier emits its own per-outcome logs.
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

    // R1 — persist `pending` BEFORE the notifier so a Brevo failure cannot lose it.
    const lead = await this.repository.insertPending({ type: 'beta', payload, dedupKey: null });
    logger.info('lead_persisted', {
      requestId: input.requestId,
      leadId: lead.id,
      type: 'beta',
    });

    try {
      // R16 — all outcomes → 202 at route layer; duplicate/noop only in logs.
      await this.notifier.subscribe(payload);
      // R2 — delivery confirmed → pending → delivered.
      await this.repository.markDelivered(lead.id);
      logger.info('lead_delivered', { leadId: lead.id, type: 'beta' });
    } catch (err) {
      // R3/R5 — NEVER rethrow: the lead is durable; the retry job re-delivers it.
      // R16 — sanitise before persisting (no api-key, no full recipient email).
      await this.repository.markFailed(lead.id, toSanitizedLeadError(err));
      logger.warn('lead_delivery_failed', {
        leadId: lead.id,
        type: 'beta',
        errorClass: err instanceof Error ? err.name : 'unknown',
      });
    }
  }
}
