import { badRequest } from '@shared/errors/app.error';
import { logger } from '@shared/logger/logger';
import { validateEmail } from '@shared/validation/email';

import type {
  BetaSignupNotifier,
  BetaSignupPayload,
} from '@modules/leads/domain/ports/beta-signup-notifier.port';

/**
 * Input accepted by the beta-signup use case — superset of the wire payload
 * (incl. request metadata). `consent` is widened to `boolean` here so the
 * runtime defense-in-depth check (R11) is type-honest even though the wire
 * Zod schema narrows it to a literal `true`.
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
 * Validates and forwards public beta-signup submissions through the notifier
 * port (R3 §3.3).
 *
 * Honeypot policy (R10): a non-empty `website` after trim triggers a SILENT
 * drop — the use case resolves without notifying so BE response timing matches
 * a legit submission, preventing bot enumeration. Whitespace-only is treated
 * as empty (mirror R4 §3.4).
 *
 * No full email is ever logged (PII discipline, R17). Only the email domain is
 * surfaced via the notifier-level structured log on duplicate / noop.
 */
export class SubmitBetaSignupUseCase {
  constructor(private readonly notifier: BetaSignupNotifier) {}

  /** Validates a beta-signup request and forwards it to the configured notifier. */
  async execute(input: SubmitBetaSignupInput): Promise<void> {
    // R11 defense-in-depth — consent must be literally true even if the wire
    // schema skipped (e.g. direct curl call hitting a stub route handler).
    if (!input.consent) {
      throw badRequest('consent must be true');
    }

    const email = input.email.trim().toLowerCase();
    if (!validateEmail(email)) {
      throw badRequest('email must be valid');
    }

    // R10 — honeypot silent drop. Whitespace-only is NOT a honeypot hit so
    // password-manager autofills of empty strings don't drop legit signups.
    if (typeof input.website === 'string' && input.website.trim().length > 0) {
      logger.warn('beta_signup_honeypot_triggered', {
        requestId: input.requestId,
        hasIp: Boolean(input.ip),
      });
      return;
    }

    // R17 — structured log with requestId + honeypotTriggered. NO full email
    // logged (PII discipline). The notifier emits its own per-outcome logs.
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
    // All outcomes are mapped to a 202 at the route layer — `duplicate` and
    // `noop` are surfaced via structured logs only (R16 anti-enumeration).
    await this.notifier.subscribe(payload);
  }
}
