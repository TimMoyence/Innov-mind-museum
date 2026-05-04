import { pruneStaleArtKeywords } from '@modules/chat/useCase/retention/prune-stale-art-keywords';
import { registerScheduledJob, type ScheduledJobHandle } from '@shared/queue/scheduled-jobs';

import type { ConnectionOptions } from 'bullmq';
import type { DataSource } from 'typeorm';

/** Config injected by the boot wire-up so tests can override connection + cron. */
export interface ArtKeywordsRetentionCronConfig {
  /** BullMQ connection reused for the scheduler queue and worker. */
  connection: ConnectionOptions;
  /** Cron pattern override. Defaults to '15 3 * * *' (03:15 UTC daily). */
  cronPattern: string;
  /** Days since updatedAt before a low-hit keyword is purged. */
  days: number;
  /** hitCount threshold — keywords with hitCount <= this value are candidates. */
  hitThreshold: number;
  /** Max rows deleted per chunk. */
  batchLimit: number;
}

/**
 * Registers the daily art-keywords retention cron via the shared
 * {@link registerScheduledJob} wrapper. Thin by design — all business
 * logic lives in {@link pruneStaleArtKeywords}.
 *
 * ADR: docs/adr/ADR-020-art-keywords-retention.md
 */
export function registerArtKeywordsRetentionCron(
  dataSource: DataSource,
  cfg: ArtKeywordsRetentionCronConfig,
): ScheduledJobHandle {
  return registerScheduledJob({
    name: 'retention-prune-art-keywords',
    cronPattern: cfg.cronPattern,
    connection: cfg.connection,
    handler: async () =>
      await pruneStaleArtKeywords(dataSource, {
        days: cfg.days,
        hitThreshold: cfg.hitThreshold,
        batchLimit: cfg.batchLimit,
      }),
  });
}
