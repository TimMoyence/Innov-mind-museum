import {
  B2B_LEAD_ROLES,
  type B2bLeadNotifier,
  type B2bLeadPayload,
  type B2bLeadRole,
} from '@modules/leads/domain/ports/b2b-lead-notifier.port';
import { badRequest } from '@shared/errors/app.error';
import { logger } from '@shared/logger/logger';
import { validateEmail } from '@shared/validation/email';

/**
 * Superset of wire payload (incl. request metadata). `consent` widened to
 * `boolean` so the R11 runtime check is type-honest (wire schema narrows to literal `true`).
 */
interface SubmitB2bLeadInput {
  email: string;
  name: string;
  museum: string;
  role: B2bLeadRole;
  message: string;
  consent: boolean;
  website?: string;
  ip?: string;
  requestId?: string;
  userAgent?: string;
}

const ROLE_SET = new Set<B2bLeadRole>(B2B_LEAD_ROLES);

/**
 * R4 §1 R10 honeypot — non-empty `website` triggers SILENT drop (no notify, BE
 * timing matches legit submission → prevents bot enumeration). Whitespace-only
 * treated as empty (R4 §3.4).
 */
export class SubmitB2bLeadUseCase {
  constructor(private readonly notifier: B2bLeadNotifier) {}

  async execute(input: SubmitB2bLeadInput): Promise<void> {
    // R11 — consent must be true even if FE skipped checkbox (direct curl).
    if (!input.consent) {
      throw badRequest('consent must be true');
    }

    const email = input.email.trim().toLowerCase();
    if (!validateEmail(email)) {
      throw badRequest('email must be valid');
    }

    const name = input.name.trim();
    if (!name || name.length > 120) {
      throw badRequest('name must be between 1 and 120 characters');
    }

    const museum = input.museum.trim();
    if (!museum || museum.length > 200) {
      throw badRequest('museum must be between 1 and 200 characters');
    }

    if (!ROLE_SET.has(input.role)) {
      throw badRequest('role must be one of director|curator|digital|other');
    }

    const message = input.message.trim();
    if (message.length < 10 || message.length > 5000) {
      throw badRequest('message must be between 10 and 5000 characters');
    }

    // R10 — honeypot silent drop. Whitespace-only NOT a hit (password-manager
    // autofill of empty strings would otherwise drop legit leads).
    if (typeof input.website === 'string' && input.website.trim().length > 0) {
      logger.warn('b2b_lead_honeypot_triggered', {
        requestId: input.requestId,
        hasIp: Boolean(input.ip),
      });
      return;
    }

    logger.info('b2b_lead_submitted', {
      requestId: input.requestId,
      museumLength: museum.length,
      role: input.role,
      honeypotTriggered: false,
    });

    const payload: B2bLeadPayload = {
      email,
      name,
      museum,
      role: input.role,
      message,
      consent: true,
      website: input.website,
      ip: input.ip,
      requestId: input.requestId,
      userAgent: input.userAgent,
    };
    await this.notifier.notify(payload);
  }
}
