import { pruneSupportTickets } from '@modules/support/useCase/retention/prune-support-tickets';
import { registerScheduledJob, type ScheduledJobHandle } from '@shared/queue/scheduled-jobs';

import type { ConnectionOptions } from 'bullmq';
import type { DataSource } from 'typeorm';

export interface SupportRetentionCronConfig {
  connection: ConnectionOptions;
  cronPattern: string;
  daysClosed: number;
  batchLimit: number;
}

export function registerSupportRetentionCron(
  dataSource: DataSource,
  cfg: SupportRetentionCronConfig,
): ScheduledJobHandle {
  return registerScheduledJob({
    name: 'retention-prune-support-tickets',
    cronPattern: cfg.cronPattern,
    connection: cfg.connection,
    handler: async () =>
      await pruneSupportTickets(dataSource, {
        daysClosed: cfg.daysClosed,
        batchLimit: cfg.batchLimit,
      }),
  });
}
