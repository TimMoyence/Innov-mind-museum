import { logger } from '@shared/logger/logger';

import type { DataSource } from 'typeorm';

/** Result of a single prune run. */
export interface PruneArtKeywordsResult {
  rowsAffected: number;
  details: Record<string, unknown>;
}

/** Configuration knobs for the art_keywords prune (env-driven). */
export interface PruneStaleArtKeywordsConfig {
  /** Days since `updatedAt` before a low-hit keyword becomes eligible. Default 90. */
  days: number;
  /** hitCount threshold — keywords with hitCount <= this value are candidates. Default 1. */
  hitThreshold: number;
  /** Max rows deleted per chunk (single transaction). Default 1000. */
  batchLimit: number;
}

/**
 * Hard-deletes art_keywords where hitCount <= hitThreshold AND
 * updatedAt < NOW() - days. Idempotent — re-running deletes only
 * newly eligible rows.
 *
 * Chunked DELETE LIMIT N per transaction so each chunk holds the row lock
 * for milliseconds. Loop until RETURNING returns 0 rows.
 *
 * Returns total rowsAffected + details (cutoffDate, hitThreshold).
 *
 * Spec: docs/superpowers/specs/2026-05-01-E-retention-policies-design.md section 3.3
 * ADR: docs/adr/ADR-020-art-keywords-retention.md
 */
export async function pruneStaleArtKeywords(
  dataSource: DataSource,
  cfg: PruneStaleArtKeywordsConfig,
): Promise<PruneArtKeywordsResult> {
  const cutoff = new Date(Date.now() - cfg.days * 24 * 60 * 60 * 1000);
  let totalDeleted = 0;
  let chunkDeleted = -1;

  while (chunkDeleted !== 0) {
    const result = await dataSource.query(
      `DELETE FROM "art_keywords"
       WHERE id IN (
         SELECT id FROM "art_keywords"
         WHERE "hitCount" <= $1
           AND "updatedAt" < $2
         ORDER BY "updatedAt" ASC
         LIMIT $3
       )
       RETURNING id`,
      [cfg.hitThreshold, cutoff.toISOString(), cfg.batchLimit],
    );
    chunkDeleted = result.length;
    totalDeleted += chunkDeleted;
    if (chunkDeleted > 0) {
      logger.info('prune_art_keywords_chunk', {
        deleted: chunkDeleted,
        totalSoFar: totalDeleted,
      });
    }
  }

  return {
    rowsAffected: totalDeleted,
    details: {
      cutoffDate: cutoff.toISOString(),
      days: cfg.days,
      hitThreshold: cfg.hitThreshold,
    },
  };
}
