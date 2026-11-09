import { setTimeout as sleep } from 'node:timers/promises';

import { logger } from '@shared/logger/logger';

import type { DataSource } from 'typeorm';

const CHUNK_THROTTLE_MS = 50;

export interface PruneReviewsResult {
  rowsAffected: number;
  details: Record<string, unknown>;
}

export interface PruneReviewsConfig {
  rejectedDays: number;
  pendingDays: number;
  batchLimit: number;
}

async function prunePass(
  dataSource: DataSource,
  status: 'rejected' | 'pending',
  cutoff: Date,
  batchLimit: number,
  logKey: string,
): Promise<number> {
  const sql = `DELETE FROM "reviews"
       WHERE id IN (
         SELECT id FROM "reviews"
         WHERE "status" = '${status}'
           AND "updatedAt" < $1
         ORDER BY "updatedAt" ASC
         LIMIT $2
       )
       RETURNING id`;
  let totalDeleted = 0;
  let chunkDeleted: number;
  do {
    const result = await dataSource.query<[unknown[], number] | undefined>(sql, [
      cutoff.toISOString(),
      batchLimit,
    ]);
    chunkDeleted = Array.isArray(result) && typeof result[1] === 'number' ? result[1] : 0;
    totalDeleted += chunkDeleted;
    if (chunkDeleted > 0) {
      logger.info(logKey, { deleted: chunkDeleted, totalSoFar: totalDeleted });
      await sleep(CHUNK_THROTTLE_MS);
    }
  } while (chunkDeleted > 0);
  return totalDeleted;
}

export async function pruneReviews(
  dataSource: DataSource,
  cfg: PruneReviewsConfig,
): Promise<PruneReviewsResult> {
  const rejectedCutoff = new Date(Date.now() - cfg.rejectedDays * 24 * 60 * 60 * 1000);
  const pendingCutoff = new Date(Date.now() - cfg.pendingDays * 24 * 60 * 60 * 1000);

  const rejectedDeleted = await prunePass(
    dataSource,
    'rejected',
    rejectedCutoff,
    cfg.batchLimit,
    'prune_reviews_rejected_chunk',
  );
  const pendingDeleted = await prunePass(
    dataSource,
    'pending',
    pendingCutoff,
    cfg.batchLimit,
    'prune_reviews_pending_chunk',
  );

  return {
    rowsAffected: rejectedDeleted + pendingDeleted,
    details: {
      rejected: rejectedDeleted,
      pending: pendingDeleted,
      rejectedCutoffDate: rejectedCutoff.toISOString(),
      pendingCutoffDate: pendingCutoff.toISOString(),
    },
  };
}
