import { pruneSupportTickets } from '@modules/support/useCase/retention/prune-support-tickets';
import { registerScheduledJob, type ScheduledJobHandle } from '@shared/queue/scheduled-jobs';

import type { ConnectionOptions } from 'bullmq';
import type { DataSource } from 'typeorm';

export interface SupportRetentionCronConfig {
  connection: ConnectionOptions;
  /** Defaults to '15 3 * * *' (03:15 UTC daily). */
  cronPattern: string;
  /** Days since updatedAt before a closed/resolved ticket is purged. */
  daysClosed: number;
  batchLimit: number;
}

/**
 * Thin wrapper around {@link registerScheduledJob} — all business logic in
 * {@link pruneSupportTickets}. ADR: docs/adr/ADR-018-support-tickets-retention.md
 */
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
