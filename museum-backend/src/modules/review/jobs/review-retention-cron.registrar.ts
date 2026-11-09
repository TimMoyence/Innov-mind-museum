import { pruneReviews } from '@modules/review/useCase/moderation/prune-reviews';
import { registerScheduledJob, type ScheduledJobHandle } from '@shared/queue/scheduled-jobs';

import type { ConnectionOptions } from 'bullmq';
import type { DataSource } from 'typeorm';

export interface ReviewRetentionCronConfig {
  connection: ConnectionOptions;
  cronPattern: string;
  rejectedDays: number;
  pendingDays: number;
  batchLimit: number;
}

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
