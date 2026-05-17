import { pruneReviews } from '@modules/review/useCase/moderation/prune-reviews';
import { registerScheduledJob, type ScheduledJobHandle } from '@shared/queue/scheduled-jobs';

import type { ConnectionOptions } from 'bullmq';
import type { DataSource } from 'typeorm';

export interface ReviewRetentionCronConfig {
  connection: ConnectionOptions;
  /** Defaults to '15 3 * * *' (03:15 UTC daily). */
  cronPattern: string;
  /** Days since updatedAt before a rejected review is purged. */
  rejectedDays: number;
  /** Days since updatedAt before a pending review is purged. */
  pendingDays: number;
  batchLimit: number;
}

/**
 * Thin wrapper around {@link registerScheduledJob} — all business logic in
 * {@link pruneReviews}. ADR: docs/adr/ADR-019-reviews-retention.md
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
