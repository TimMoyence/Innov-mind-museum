import { registerScheduledJob, type ScheduledJobHandle } from '@shared/queue/scheduled-jobs';

import { pruneReviews } from '../useCase/moderation/prune-reviews';

import type { ConnectionOptions } from 'bullmq';
import type { DataSource } from 'typeorm';

/** Config injected by the boot wire-up so tests can override connection + cron. */
export interface ReviewRetentionCronConfig {
  /** BullMQ connection reused for the scheduler queue and worker. */
  connection: ConnectionOptions;
  /** Cron pattern override. Defaults to '15 3 * * *' (03:15 UTC daily). */
  cronPattern: string;
  /** Days since updatedAt before a rejected review is purged. */
  rejectedDays: number;
  /** Days since updatedAt before a pending review is purged. */
  pendingDays: number;
  /** Max rows deleted per chunk. */
  batchLimit: number;
}

/**
 * Registers the daily reviews retention cron via the shared
 * {@link registerScheduledJob} wrapper. Thin by design — all business
 * logic lives in {@link pruneReviews}.
 *
 * ADR: docs/adr/ADR-019-reviews-retention.md
 */
export function registerReviewRetentionCron(
  dataSource: DataSource,
  cfg: ReviewRetentionCronConfig,
): ScheduledJobHandle {
  return registerScheduledJob({
    name: 'retention-prune-reviews',
    cronPattern: cfg.cronPattern,
    connection: cfg.connection,
    handler: async () =>
      await pruneReviews(dataSource, {
        rejectedDays: cfg.rejectedDays,
        pendingDays: cfg.pendingDays,
        batchLimit: cfg.batchLimit,
      }),
  });
}
