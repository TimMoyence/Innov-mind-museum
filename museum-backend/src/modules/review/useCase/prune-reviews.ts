import { logger } from '@shared/logger/logger';

import type { DataSource } from 'typeorm';

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
 * Spec: docs/superpowers/specs/2026-05-01-E-retention-policies-design.md section 3.2
 * ADR: docs/adr/ADR-019-reviews-retention.md
 */
export async function pruneReviews(
  dataSource: DataSource,
  cfg: PruneReviewsConfig,
): Promise<PruneReviewsResult> {
  const rejectedCutoff = new Date(Date.now() - cfg.rejectedDays * 24 * 60 * 60 * 1000);
  const pendingCutoff = new Date(Date.now() - cfg.pendingDays * 24 * 60 * 60 * 1000);

  // Pass 1: rejected reviews
  let rejectedDeleted = 0;
  let chunkDeleted = -1;
  while (chunkDeleted !== 0) {
    const result = await dataSource.query(
      `DELETE FROM "reviews"
       WHERE id IN (
         SELECT id FROM "reviews"
         WHERE "status" = 'rejected'
           AND "updatedAt" < $1
         ORDER BY "updatedAt" ASC
         LIMIT $2
       )
       RETURNING id`,
      [rejectedCutoff.toISOString(), cfg.batchLimit],
    );
    chunkDeleted = result.length;
    rejectedDeleted += chunkDeleted;
    if (chunkDeleted > 0) {
      logger.info('prune_reviews_rejected_chunk', {
        deleted: chunkDeleted,
        totalSoFar: rejectedDeleted,
      });
    }
  }

  // Pass 2: pending reviews
  let pendingDeleted = 0;
  chunkDeleted = -1;
  while (chunkDeleted !== 0) {
    const result = await dataSource.query(
      `DELETE FROM "reviews"
       WHERE id IN (
         SELECT id FROM "reviews"
         WHERE "status" = 'pending'
           AND "updatedAt" < $1
         ORDER BY "updatedAt" ASC
         LIMIT $2
       )
       RETURNING id`,
      [pendingCutoff.toISOString(), cfg.batchLimit],
    );
    chunkDeleted = result.length;
    pendingDeleted += chunkDeleted;
    if (chunkDeleted > 0) {
      logger.info('prune_reviews_pending_chunk', {
        deleted: chunkDeleted,
        totalSoFar: pendingDeleted,
      });
    }
  }

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
