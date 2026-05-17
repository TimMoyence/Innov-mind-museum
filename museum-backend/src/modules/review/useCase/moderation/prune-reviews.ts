import { setTimeout as sleep } from 'node:timers/promises';

import { logger } from '@shared/logger/logger';

import type { DataSource } from 'typeorm';

/**
 * Throttle between non-empty chunks so a runaway purge cannot monopolise
 * pgbouncer (incident 2026-05-08 hardening — /team run `2026-05-08-prune-hardening`).
 */
const CHUNK_THROTTLE_MS = 50;

export interface PruneReviewsResult {
  rowsAffected: number;
  details: Record<string, unknown>;
}

export interface PruneReviewsConfig {
  /** Default 30. */
  rejectedDays: number;
  /** Default 60. */
  pendingDays: number;
  /** Rows per chunk (single transaction). Default 1000. */
  batchLimit: number;
}

/**
 * do/while ensures the first DELETE always fires (even on an empty table),
 * exits when a chunk reports 0. TypeORM 0.3.x returns DELETE results as
 * `[rows, rowCount]` — see prune-support-tickets.ts for the production
 * incident background (2026-05-08).
 */
async function prunePass(
  dataSource: DataSource,
  status: 'rejected' | 'pending',
  cutoff: Date,
  batchLimit: number,
  logKey: string,
): Promise<number> {
  // SEC: `status` is a TS literal-typed arg (`'rejected' | 'pending'`) — compiler-enforced,
  // never user input — so string interpolation is safe AND keeps the EXPLAIN plan identical
  // to the pre-refactor literal-status query.
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

/**
 * Hard-deletes reviews in two passes:
 *   1. status = 'rejected' AND updatedAt < NOW() - rejectedDays
 *   2. status = 'pending'  AND updatedAt < NOW() - pendingDays
 *
 * GDPR: approved reviews kept forever (legitimate interest / public record).
 * Idempotent — re-running deletes only newly eligible rows. Chunked DELETE
 * LIMIT N loop holds row locks for milliseconds.
 *
 * ADR: docs/adr/ADR-019-reviews-retention.md
 */
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
