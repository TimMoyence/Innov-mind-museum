import type { MuseumEnrichmentView } from '@modules/museum/domain/enrichment/enrichment.types';

/**
 * Keeps the museum module independent of the knowledge-extraction TypeORM
 * repo while sharing the same `museum_enrichment` table.
 */
export interface MuseumEnrichmentCachePort {
  /** Returns null on miss or stale (older than `freshWindowMs`). */
  findFresh(input: {
    museumId: number;
    locale: string;
    freshWindowMs: number;
    now?: Date;
  }): Promise<MuseumEnrichmentView | null>;

  upsert(input: MuseumEnrichmentView): Promise<void>;

  /**
   * Results MUST be ordered by `fetchedAt ASC` so the oldest rows are
   * refreshed first across successive scans.
   */
  findStaleRows(
    thresholdDate: Date,
    limit: number,
  ): Promise<{ museumId: number; locale: string }[]>;

  /**
   * Deletes every row with `fetchedAt < threshold`. Legacy name-keyed rows
   * (`museumId IS NULL`) preserved. Idempotent + safe concurrent with
   * on-demand enrichment (row-level DELETE is atomic per row).
   */
  deleteStaleSince(threshold: Date): Promise<number>;
}
