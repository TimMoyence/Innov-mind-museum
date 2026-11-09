import { pruneStaleArtKeywords } from '@modules/chat/useCase/prune-stale-art-keywords';
import { registerScheduledJob, type ScheduledJobHandle } from '@shared/queue/scheduled-jobs';

import type { ConnectionOptions } from 'bullmq';
import type { DataSource } from 'typeorm';

export interface ArtKeywordsRetentionCronConfig {
  connection: ConnectionOptions;
  cronPattern: string;
  days: number;
  hitThreshold: number;
  batchLimit: number;
}

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
