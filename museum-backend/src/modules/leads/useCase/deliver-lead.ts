import { toSanitizedLeadError } from '@modules/leads/domain/lead/sanitizeLeadError';
import { logger } from '@shared/logger/logger';

import type { ILeadRepository } from '@modules/leads/domain/lead/lead.repository.interface';
import type { LeadDTO } from '@modules/leads/domain/lead/lead.types';

export type LeadDelivery<T> = { delivered: true; outcome: T } | { delivered: false };

export async function deliverLead<T>(params: {
  repository: Pick<ILeadRepository, 'markDelivered' | 'markFailed'>;
  lead: Pick<LeadDTO, 'id' | 'type'>;
  send: () => Promise<T>;
  context?: Record<string, unknown>;
  failureContext?: Record<string, unknown>;
  onFailed?: () => Promise<void>;
}): Promise<LeadDelivery<T>> {
  const { repository, lead, send, context, failureContext, onFailed } = params;
  try {
    const outcome = await send();
    await repository.markDelivered(lead.id);
    logger.info('lead_delivered', { leadId: lead.id, type: lead.type, ...context });
    return { delivered: true, outcome };
  } catch (err) {
    await repository.markFailed(lead.id, toSanitizedLeadError(err));
    await onFailed?.();
    logger.warn('lead_delivery_failed', {
      leadId: lead.id,
      type: lead.type,
      ...context,
      ...failureContext,
      errorClass: err instanceof Error ? err.name : 'unknown',
    });
    return { delivered: false };
  }
}
