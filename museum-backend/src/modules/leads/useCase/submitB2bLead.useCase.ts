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
 * Input accepted by the B2B-lead use case — superset of the wire payload
 * (incl. request metadata). `consent` is widened to `boolean` here so the
 * runtime defense-in-depth check (R11) is type-honest even though the wire
 * Zod schema narrows it to a literal `true`.
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
 * Validates and forwards public B2B-lead submissions through the notifier port.
 *
 * Honeypot policy (R4 §1 R10): a non-empty `website` triggers a SILENT drop —
 * the use case resolves without notifying so the BE response timing matches a
 * legit submission, preventing bot enumeration. Whitespace-only is treated as
 * empty (R4 §3.4 implementation contract).
 */
export class SubmitB2bLeadUseCase {
  constructor(private readonly notifier: B2bLeadNotifier) {}

  /** Validates a B2B-lead request and forwards it to the configured notifier. */
  async execute(input: SubmitB2bLeadInput): Promise<void> {
    // R11 defense-in-depth — consent must be true even if the FE skipped the
    // checkbox (e.g. direct curl call).
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

    // R10 — honeypot silent drop. Whitespace-only is NOT a honeypot hit so
    // password-manager autofills of empty strings don't drop legit leads.
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
