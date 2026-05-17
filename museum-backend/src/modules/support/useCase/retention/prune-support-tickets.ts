import { setTimeout as sleep } from 'node:timers/promises';

import { logger } from '@shared/logger/logger';

import type { DataSource } from 'typeorm';

/**
 * Throttle between non-empty chunks so a runaway purge cannot monopolise
 * pgbouncer (incident 2026-05-08 hardening — /team run `2026-05-08-prune-hardening`).
 * ~10× a nominal PG query so other traffic gets a clear window.
 */
const CHUNK_THROTTLE_MS = 50;

export interface PruneResult {
  rowsAffected: number;
  details: Record<string, unknown>;
}

export interface PruneSupportTicketsConfig {
  /** Default 365. */
  daysClosed: number;
  /** Rows per chunk (single transaction). Default 1000. */
  batchLimit: number;
}

/**
 * Hard-deletes support_tickets where status IN ('closed', 'resolved')
 * AND updatedAt < NOW() - daysClosed. Cascades to ticket_messages via FK.
 * Idempotent — re-running deletes only newly eligible rows.
 *
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
    // WHY: TypeORM 0.3.x normalizes DELETE/UPDATE results to `[rows, rowCount]`
    // (PostgresQueryRunner.js, raw.command switch). Reading `result.length` is
    // always 2 → infinite loop + prod DB saturation (incident 2026-05-08).
    // Same shape handling as shared/audit/audit-ip-anonymizer.job.ts.
    const result = await dataSource.query<[unknown[], number] | undefined>(
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
    chunkDeleted = Array.isArray(result) && typeof result[1] === 'number' ? result[1] : 0;
    totalDeleted += chunkDeleted;
    if (chunkDeleted > 0) {
      logger.info('prune_support_tickets_chunk', {
        deleted: chunkDeleted,
        totalSoFar: totalDeleted,
      });
      await sleep(CHUNK_THROTTLE_MS);
    }
  }

  return {
    rowsAffected: totalDeleted,
    details: { cutoffDate: cutoff.toISOString(), daysClosed: cfg.daysClosed },
  };
}
