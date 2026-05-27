import { createHash } from 'node:crypto';

import { toSanitizedLeadError } from '@modules/leads/domain/lead/sanitizeLeadError';
import {
  B2B_LEAD_ROLES,
  type B2bLeadNotifier,
  type B2bLeadPayload,
  type B2bLeadRole,
} from '@modules/leads/domain/ports/b2b-lead-notifier.port';
import { badRequest } from '@shared/errors/app.error';
import { logger } from '@shared/logger/logger';
import { extractEmailDomain } from '@shared/pii/extractEmailDomain';
import { validateEmail } from '@shared/validation/email';


import type { ILeadRepository } from '@modules/leads/domain/lead/lead.repository.interface';

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
 * Logical B2B dedup key (spec R15, design §4/D5): `sha256('b2b|'+email+'|'+museum)`
 * over the normalised values. An active (pending|delivered) lead carrying this
 * key means the same prospect already reached the inbox — a second submit must
 * NOT trigger a second email. `failed` is NOT a dedup block (we want to re-deliver).
 */
function computeDedupKey(emailNormalized: string, museumNormalized: string): string {
  return createHash('sha256').update(`b2b|${emailNormalized}|${museumNormalized}`).digest('hex');
}

/**
 * Validates + normalises a raw B2B submission into the wire payload (R11 consent,
 * R6 email/name/museum/role/message bounds). Throws `badRequest` (400) on any
 * violation. Extracted from `execute` so the orchestration (honeypot → dedup →
 * persist-then-notify) stays within the complexity budget and validation stays
 * unit-testable in isolation.
 */
function validateB2bLead(input: SubmitB2bLeadInput): B2bLeadPayload {
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

  return {
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
}

/**
 * Persist-then-notify (Cycle B « Aucun lead perdu », spec R1/R2/R3/R5/R7/R15):
 * the validated lead is persisted `pending` BEFORE the Brevo notifier is
 * invoked, so a Brevo runtime failure never loses it (the row survives as
 * `failed`, recoverable by the retry job). The use-case does NOT rethrow on
 * notifier failure — durability is guaranteed by persistence and the route
 * answers 202 regardless of the delivery outcome (R5).
 *
 * R7 honeypot — non-empty `website` after trim → SILENT drop (no persist, no
 * notify; BE timing matches a legit submission → anti-enumeration). Whitespace-
 * only NOT a hit (password-manager autofill of empty strings would drop legit
 * leads).
 */
export class SubmitB2bLeadUseCase {
  constructor(
    private readonly notifier: B2bLeadNotifier,
    private readonly repository: ILeadRepository,
  ) {}

  async execute(input: SubmitB2bLeadInput): Promise<void> {
    const payload = validateB2bLead(input);

    // R7 — honeypot silent drop BEFORE any persistence. Whitespace-only NOT a hit.
    if (typeof input.website === 'string' && input.website.trim().length > 0) {
      logger.warn('b2b_lead_honeypot_triggered', {
        requestId: input.requestId,
        hasIp: Boolean(input.ip),
      });
      return;
    }

    // R15 — logical dedup: if an active (pending|delivered) lead already carries
    // this key, the prospect already reached the inbox → answer 202 without a
    // second persist or notify (anti-spam inbox). `failed` is NOT a block.
    const dedupKey = computeDedupKey(payload.email, payload.museum.toLowerCase());
    const existing = await this.repository.findActiveByDedupKey(dedupKey);
    if (existing) {
      logger.info('lead_dedup_hit', {
        requestId: input.requestId,
        leadId: existing.id,
        emailDomain: extractEmailDomain(payload.email),
      });
      return;
    }

    logger.info('b2b_lead_submitted', {
      requestId: input.requestId,
      museumLength: payload.museum.length,
      role: input.role,
      honeypotTriggered: false,
    });

    // R1 — persist `pending` BEFORE the notifier so a Brevo failure cannot lose it.
    const lead = await this.repository.insertPending({ type: 'b2b', payload, dedupKey });
    logger.info('lead_persisted', {
      requestId: input.requestId,
      leadId: lead.id,
      type: 'b2b',
    });

    try {
      await this.notifier.notify(payload);
      // R2 — delivery confirmed → pending → delivered.
      await this.repository.markDelivered(lead.id);
      logger.info('lead_delivered', { leadId: lead.id, type: 'b2b' });
    } catch (err) {
      // R3/R5 — NEVER rethrow: the lead is durable; the retry job re-delivers it.
      // R16 — the recorded `lastError` is sanitised (no Brevo api-key, no full
      // recipient email) before it becomes a durable, log-bound copy.
      await this.repository.markFailed(lead.id, toSanitizedLeadError(err));
      logger.warn('lead_delivery_failed', {
        leadId: lead.id,
        type: 'b2b',
        errorClass: err instanceof Error ? err.name : 'unknown',
      });
    }
  }
}
