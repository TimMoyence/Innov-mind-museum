import { setTimeout as sleep } from 'node:timers/promises';

import { logger } from '@shared/logger/logger';

import type { DataSource } from 'typeorm';

const CHUNK_THROTTLE_MS = 50;

export interface PruneArtKeywordsResult {
  rowsAffected: number;
  details: Record<string, unknown>;
}

export interface PruneStaleArtKeywordsConfig {
  days: number;
  hitThreshold: number;
  batchLimit: number;
}

export async function pruneStaleArtKeywords(
  dataSource: DataSource,
  cfg: PruneStaleArtKeywordsConfig,
): Promise<PruneArtKeywordsResult> {
  const cutoff = new Date(Date.now() - cfg.days * 24 * 60 * 60 * 1000);
  let totalDeleted = 0;
  let chunkDeleted = -1;

  while (chunkDeleted !== 0) {
    const result = await dataSource.query<[unknown[], number] | undefined>(
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
    chunkDeleted = Array.isArray(result) && typeof result[1] === 'number' ? result[1] : 0;
    totalDeleted += chunkDeleted;
    if (chunkDeleted > 0) {
      logger.info('prune_art_keywords_chunk', {
        deleted: chunkDeleted,
        totalSoFar: totalDeleted,
      });
      await sleep(CHUNK_THROTTLE_MS);
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
