import { badRequest } from '@shared/errors/app.error';
import { logger } from '@shared/logger/logger';
import { validateEmail } from '@shared/validation/email';

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
 * R3 §3.3. R10 honeypot — non-empty `website` after trim → SILENT drop (no
 * notify, BE timing matches legit submission). Whitespace-only treated as
 * empty (mirror R4 §3.4). R17 PII — full email NEVER logged (only domain via
 * notifier-level log on duplicate / noop).
 */
export class SubmitBetaSignupUseCase {
  constructor(private readonly notifier: BetaSignupNotifier) {}

  async execute(input: SubmitBetaSignupInput): Promise<void> {
    // R11 — consent must be literally true even if wire schema skipped (direct curl).
    if (!input.consent) {
      throw badRequest('consent must be true');
    }

    const email = input.email.trim().toLowerCase();
    if (!validateEmail(email)) {
      throw badRequest('email must be valid');
    }

    // R10 — honeypot silent drop. Whitespace-only NOT a hit (password-manager autofill).
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
    // R16 — all outcomes → 202 at route layer; duplicate/noop only in logs.
    await this.notifier.subscribe(payload);
  }
}
