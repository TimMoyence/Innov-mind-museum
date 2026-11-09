import { setTimeout as sleep } from 'node:timers/promises';

import { logger } from '@shared/logger/logger';

import type { DataSource } from 'typeorm';

const CHUNK_THROTTLE_MS = 50;

export interface PruneResult {
  rowsAffected: number;
  details: Record<string, unknown>;
}

export interface PruneSupportTicketsConfig {
  daysClosed: number;
  batchLimit: number;
}

export async function pruneSupportTickets(
  dataSource: DataSource,
  cfg: PruneSupportTicketsConfig,
): Promise<PruneResult> {
  const cutoff = new Date(Date.now() - cfg.daysClosed * 24 * 60 * 60 * 1000);
  let totalDeleted = 0;
  let chunkDeleted = -1;

  while (chunkDeleted !== 0) {
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
