import { logger } from '@shared/logger/logger';

import type { DataSource } from 'typeorm';

/** Result of a single prune run. */
export interface PruneResult {
  rowsAffected: number;
  details: Record<string, unknown>;
}

/** Configuration knobs for the support-tickets prune (env-driven). */
export interface PruneSupportTicketsConfig {
  /** Days since `updatedAt` before a closed/resolved ticket becomes eligible. Default 365. */
  daysClosed: number;
  /** Max rows deleted per chunk (single transaction). Default 1000. */
  batchLimit: number;
}

/**
 * Hard-deletes support_tickets where status IN ('closed', 'resolved')
 * AND updatedAt < NOW() - daysClosed days. Cascades to ticket_messages
 * via existing FK. Idempotent — re-running deletes only newly eligible rows.
 *
 * Chunked DELETE LIMIT N per transaction so each chunk holds the row lock
 * for milliseconds. Loop until RETURNING returns 0 rows.
 *
 * Returns total rowsAffected + details (cutoffDate ISO string).
 *
 * Spec: docs/superpowers/specs/2026-05-01-E-retention-policies-design.md section 3.1
 * ADR: docs/adr/ADR-018-support-tickets-retention.md
 */
export async function pruneSupportTickets(
  dataSource: DataSource,
  cfg: PruneSupportTicketsConfig,
): Promise<PruneResult> {
  const cutoff = new Date(Date.now() - cfg.daysClosed * 24 * 60 * 60 * 1000);
  let totalDeleted = 0;
  let chunkDeleted = -1;

  while (chunkDeleted !== 0) {
    const result = await dataSource.query(
      `DELETE FROM "support_tickets"
       WHERE id IN (
         SELECT id FROM "support_tickets"
         WHERE "status" IN ('closed', 'resolved')
           AND "updatedAt" < $1
         ORDER BY "updatedAt" ASC
         LIMIT $2
       )
       RETURNING id`,
      [cutoff.toISOString(), cfg.batchLimit],
    );
    chunkDeleted = result.length;
    totalDeleted += chunkDeleted;
    if (chunkDeleted > 0) {
      logger.info('prune_support_tickets_chunk', {
        deleted: chunkDeleted,
        totalSoFar: totalDeleted,
      });
    }
  }

  return {
    rowsAffected: totalDeleted,
    details: { cutoffDate: cutoff.toISOString(), daysClosed: cfg.daysClosed },
  };
}
