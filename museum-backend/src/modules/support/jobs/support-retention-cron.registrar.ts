import { registerScheduledJob, type ScheduledJobHandle } from '@shared/queue/scheduled-jobs';

import { pruneSupportTickets } from '../useCase/retention/prune-support-tickets';

import type { ConnectionOptions } from 'bullmq';
import type { DataSource } from 'typeorm';

/** Config injected by the boot wire-up so tests can override connection + cron. */
export interface SupportRetentionCronConfig {
  /** BullMQ connection reused for the scheduler queue and worker. */
  connection: ConnectionOptions;
  /** Cron pattern override. Defaults to '15 3 * * *' (03:15 UTC daily). */
  cronPattern: string;
  /** Days since updatedAt before a closed/resolved ticket is purged. */
  daysClosed: number;
  /** Max rows deleted per chunk. */
  batchLimit: number;
}

/**
 * Registers the daily support-tickets retention cron via the shared
 * {@link registerScheduledJob} wrapper. Thin by design — all business
 * logic lives in {@link pruneSupportTickets}.
 *
 * ADR: docs/adr/ADR-018-support-tickets-retention.md
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
