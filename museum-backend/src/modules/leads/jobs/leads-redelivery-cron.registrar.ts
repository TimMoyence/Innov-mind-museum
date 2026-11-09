import { leadNotifierByType } from '@modules/leads/useCase';
import { RedeliverPendingLeadsUseCase } from '@modules/leads/useCase/redeliverPendingLeads.useCase';
import { registerScheduledJob, type ScheduledJobHandle } from '@shared/queue/scheduled-jobs';

import type { ILeadRepository } from '@modules/leads/domain/lead/lead.repository.interface';
import type { LeadDeliveryNotifier } from '@modules/leads/useCase/redeliverPendingLeads.useCase';
import type { ConnectionOptions } from 'bullmq';

export interface LeadsRedeliveryCronConfig {
  connection: ConnectionOptions;
  cronPattern: string;
  maxAttempts: number;
  batchLimit: number;
  retentionDays: number;
  backoffBaseMs: number;
  backoffCapMs: number;
}

export function registerLeadsRedeliveryCron(
  repository: ILeadRepository,
  cfg: LeadsRedeliveryCronConfig,
): ScheduledJobHandle {
  const useCase = new RedeliverPendingLeadsUseCase(
    repository,
    (type) => leadNotifierByType(type) as LeadDeliveryNotifier,
    {
      maxAttempts: cfg.maxAttempts,
      batchLimit: cfg.batchLimit,
      retentionDays: cfg.retentionDays,
      backoffBaseMs: cfg.backoffBaseMs,
      backoffCapMs: cfg.backoffCapMs,
    },
  );

  return registerScheduledJob({
    name: 'leads-redelivery',
    cronPattern: cfg.cronPattern,
    connection: cfg.connection,
    handler: async () => await useCase.execute(),
  });
}
