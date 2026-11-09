import { createHash } from 'node:crypto';

import { describeLimit, isEmail, isWithinLimit, TEXT_LIMITS } from '@musaium/shared';

import { toSanitizedLeadError } from '@modules/leads/domain/lead/sanitizeLeadError';
import {
  B2B_LEAD_ROLES,
  type B2bLeadNotifier,
  type B2bLeadPayload,
  type B2bLeadRole,
} from '@modules/leads/domain/ports/b2b-lead-notifier.port';
import { invalidInput } from '@shared/errors/app.error';
import { logger } from '@shared/logger/logger';
import { extractEmailDomain } from '@shared/pii/extractEmailDomain';
import { judgeSubmission } from '@shared/validation/honeypot';

import type { ILeadRepository } from '@modules/leads/domain/lead/lead.repository.interface';

interface SubmitB2bLeadInput {
  email: string;
  name: string;
  museum: string;
  role: B2bLeadRole;
  message: string;
  consent: boolean;
  website?: string;
  fillMs?: number;
  ip?: string;
  requestId?: string;
  userAgent?: string;
}

const ROLE_SET = new Set<B2bLeadRole>(B2B_LEAD_ROLES);

function computeDedupKey(emailNormalized: string, museumNormalized: string): string {
  return createHash('sha256').update(`b2b|${emailNormalized}|${museumNormalized}`).digest('hex');
}

function validateB2bLead(input: SubmitB2bLeadInput): B2bLeadPayload {
  if (!input.consent) {
    throw invalidInput('consent must be true');
  }

  const email = input.email.trim().toLowerCase();
  if (!isEmail(email)) {
    throw invalidInput('email must be valid');
  }

  const name = input.name.trim();
  if (!isWithinLimit(name, TEXT_LIMITS.contactName)) {
    throw invalidInput(describeLimit('name', TEXT_LIMITS.contactName));
  }

  const museum = input.museum.trim();
  if (!isWithinLimit(museum, TEXT_LIMITS.leadMuseum)) {
    throw invalidInput(describeLimit('museum', TEXT_LIMITS.leadMuseum));
  }

  if (!ROLE_SET.has(input.role)) {
    throw invalidInput('role must be one of director|curator|digital|other');
  }

  const message = input.message.trim();
  if (!isWithinLimit(message, TEXT_LIMITS.contactMessage)) {
    throw invalidInput(describeLimit('message', TEXT_LIMITS.contactMessage));
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

export class SubmitB2bLeadUseCase {
  constructor(
    private readonly notifier: B2bLeadNotifier,
    private readonly repository: ILeadRepository,
  ) {}

  async execute(input: SubmitB2bLeadInput): Promise<void> {
    const verdict = judgeSubmission(input);
    const payload = { ...validateB2bLead(input), suspect: verdict === 'suspect' };

    if (verdict === 'bot') {
      logger.warn('b2b_lead_honeypot_triggered', {
        requestId: input.requestId,
        hasIp: Boolean(input.ip),
      });
      return;
    }

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

    const lead = await this.repository.insertPending({ type: 'b2b', payload, dedupKey });
    logger.info('lead_persisted', {
      requestId: input.requestId,
      leadId: lead.id,
      type: 'b2b',
    });

    try {
      await this.notifier.notify(payload);
      await this.repository.markDelivered(lead.id);
      logger.info('lead_delivered', { leadId: lead.id, type: 'b2b' });
    } catch (err) {
      await this.repository.markFailed(lead.id, toSanitizedLeadError(err));
      logger.warn('lead_delivery_failed', {
        leadId: lead.id,
        type: 'b2b',
        errorClass: err instanceof Error ? err.name : 'unknown',
      });
    }
  }
}
