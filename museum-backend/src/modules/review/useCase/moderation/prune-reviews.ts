import { setTimeout as sleep } from 'node:timers/promises';

import { logger } from '@shared/logger/logger';

import type { DataSource } from 'typeorm';

/**
 * Pause inserted between non-empty chunks so a runaway purge cannot monopolise
 * pgbouncer (incident 2026-05-08 hardening — see /team run
 * `2026-05-08-prune-hardening`).
 */
const CHUNK_THROTTLE_MS = 50;

/** Result of a single prune run. */
export interface PruneReviewsResult {
  rowsAffected: number;
  details: Record<string, unknown>;
}

/** Configuration knobs for the reviews prune (env-driven). */
export interface PruneReviewsConfig {
  /** Days since `updatedAt` before a rejected review becomes eligible. Default 30. */
  rejectedDays: number;
  /** Days since `updatedAt` before a pending review becomes eligible. Default 60. */
  pendingDays: number;
  /** Max rows deleted per chunk (single transaction). Default 1000. */
  batchLimit: number;
}

/**
 * Run one chunked DELETE pass for the given status. Returns the total number
 * of rows deleted across all chunks.
 *
 * Uses a do/while loop so the first DELETE always fires (even on an empty
 * table), and exits cleanly when a chunk reports 0 affected rows. TypeORM
 * 0.3.x returns DELETE results as `[rows, rowCount]` — see
 * prune-support-tickets.ts for the production-incident background (2026-05-08).
 */
async function prunePass(
  dataSource: DataSource,
  status: 'rejected' | 'pending',
  cutoff: Date,
  batchLimit: number,
  logKey: string,
): Promise<number> {
  // `status` is a TS literal-typed argument (`'rejected' | 'pending'`) — compiler-enforced,
  // never user input — so interpolating it into the SQL string is safe and keeps the
  // EXPLAIN plan identical to the pre-refactor literal-status query.
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
 * Approved reviews are kept forever (GDPR legitimate interest / public record).
 * Each pass uses a chunked DELETE LIMIT N loop so row locks are held for
 * milliseconds. Both passes are idempotent — re-running deletes only newly
 * eligible rows.
 *
 * Returns total rowsAffected + details (rejected count, pending count, cutoffs).
 *
 * Spec: see git log (deleted 2026-05-03 — roadmap consolidation, original spec in commit history)
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
