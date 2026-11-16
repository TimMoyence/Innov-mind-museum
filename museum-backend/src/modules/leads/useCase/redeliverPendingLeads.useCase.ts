import { deliverLead } from '@modules/leads/useCase/deliver-lead';
import { logger } from '@shared/logger/logger';
import { randomSource } from '@shared/utils/random';

import type { ILeadRepository } from '@modules/leads/domain/lead/lead.repository.interface';
import type { LeadDTO, LeadType } from '@modules/leads/domain/lead/lead.types';
import type { ScheduledJobResult } from '@shared/queue/scheduled-jobs';

export type LeadDeliveryNotifier =
  | { notify: (payload: never) => Promise<void> }
  | { subscribe: (payload: never) => Promise<unknown> };

export type LeadNotifierResolver = (type: LeadType) => LeadDeliveryNotifier;

export interface RedeliverPendingLeadsConfig {
  maxAttempts: number;
  batchLimit: number;
  retentionDays: number;
  backoffBaseMs: number;
  backoffCapMs: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const JITTER_FRACTION = 0.1;

function computeNextEligibleAt(attempts: number, baseMs: number, capMs: number): string {
  const exponential = baseMs * 2 ** Math.max(0, attempts - 1);
  const bounded = Math.min(exponential, capMs);
  const jitter = bounded * JITTER_FRACTION * (randomSource.unit() * 2 - 1);
  const delay = Math.max(0, Math.round(bounded + jitter));
  return new Date(Date.now() + delay).toISOString();
}

async function deliver(notifier: LeadDeliveryNotifier, lead: LeadDTO): Promise<void> {
  if ('notify' in notifier) {
    await notifier.notify(lead.payload as never);
    return;
  }
  await notifier.subscribe(lead.payload as never);
}

export class RedeliverPendingLeadsUseCase {
  constructor(
    private readonly repository: ILeadRepository,
    private readonly resolveNotifier: LeadNotifierResolver,
    private readonly config: RedeliverPendingLeadsConfig,
  ) {}

  async execute(): Promise<ScheduledJobResult> {
    const { maxAttempts, batchLimit, retentionDays, backoffBaseMs, backoffCapMs } = this.config;

    const eligible = await this.repository.selectRedeliverable(maxAttempts, batchLimit);
    logger.info('lead_redelivery_started', { batchSize: eligible.length });

    let delivered = 0;
    let stillFailed = 0;

    for (const lead of eligible) {
      const delivery = await deliverLead({
        repository: this.repository,
        lead,
        send: () => deliver(this.resolveNotifier(lead.type), lead),
        context: { via: 'redelivery' },
        onFailed: () =>
          this.repository.scheduleNextAttempt(
            lead.id,
            computeNextEligibleAt(lead.attempts + 1, backoffBaseMs, backoffCapMs),
          ),
      });
      if (delivery.delivered) delivered += 1;
      else stillFailed += 1;
    }

    const cutoffIso = new Date(Date.now() - retentionDays * MS_PER_DAY).toISOString();
    const purged = await this.repository.purgeDeliveredOlderThan(cutoffIso, batchLimit);

    logger.info('lead_redelivery_completed', { delivered, stillFailed, purged });

    return {
      rowsAffected: delivered + stillFailed,
      details: { delivered, stillFailed, purged },
    };
  }
}
