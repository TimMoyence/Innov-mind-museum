import { createHash } from 'node:crypto';

import { isEmail, TEXT_LIMITS } from '@musaium/shared';

import {
  B2B_LEAD_ROLES,
  type B2bLeadNotifier,
  type B2bLeadPayload,
  type B2bLeadRole,
} from '@modules/leads/domain/ports/b2b-lead-notifier.port';
import { deliverLead } from '@modules/leads/useCase/deliver-lead';
import { invalidInput } from '@shared/errors/app.error';
import { logger } from '@shared/logger/logger';
import { extractEmailDomain } from '@shared/pii/extractEmailDomain';
import { assertOneOf } from '@shared/validation/one-of';
import { screenSubmission } from '@shared/validation/screen-submission';
import { assertWithinLimit } from '@shared/validation/text-field';

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
  assertWithinLimit('name', name, TEXT_LIMITS.contactName);

  const museum = input.museum.trim();
  assertWithinLimit('museum', museum, TEXT_LIMITS.leadMuseum);

  assertOneOf('role', B2B_LEAD_ROLES, input.role);

  const message = input.message.trim();
  assertWithinLimit('message', message, TEXT_LIMITS.contactMessage);

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
    const fields = validateB2bLead(input);
    const verdict = screenSubmission(input, 'b2b_lead');
    if (verdict === 'bot') return;
    const payload = { ...fields, suspect: verdict === 'suspect' };

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

    await deliverLead({
      repository: this.repository,
      lead,
      send: () => this.notifier.notify(payload),
    });
  }
}
