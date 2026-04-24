import type { MuseumEnrichmentView } from '../enrichment.types';

/**
 * Persistence port for the hybrid museum enrichment cache row. Keeps the
 * museum module independent of the knowledge-extraction TypeORM repo while
 * sharing the same `museum_enrichment` table.
 */
export interface MuseumEnrichmentCachePort {
  /**
   * Returns the cached enrichment for `(museumId, locale)` when fresher than
   * `freshWindowMs`. `null` otherwise (miss or stale).
   */
  findFresh(input: {
    museumId: number;
    locale: string;
    freshWindowMs: number;
    now?: Date;
  }): Promise<MuseumEnrichmentView | null>;

  /** Inserts or replaces the enrichment row for `(museumId, locale)`. */
  upsert(input: MuseumEnrichmentView): Promise<void>;

  /**
   * Returns the oldest enrichment rows whose `fetchedAt` predates
   * `thresholdDate`, capped at `limit`. Drives the daily stale-refresh scan
   * performed by `RefreshStaleEnrichmentsUseCase`.
   *
   * Results MUST be ordered by `fetchedAt ASC` so the oldest rows are
   * refreshed first across successive scans.
   */
  findStaleRows(
    thresholdDate: Date,
    limit: number,
  ): Promise<{ museumId: number; locale: string }[]>;

  /**
   * Permanently deletes every enrichment row with `fetchedAt < threshold`.
   * Returns the number of rows removed.
   *
   * Used by `PurgeDeadEnrichmentsUseCase` to bound the size of the
   * `museum_enrichment` table — rows untouched for longer than the hard-delete
   * window (see `env.enrichment.hardDeleteAfterDays`) are considered dead and
   * reclaimed. Legacy name-keyed rows (`museumId IS NULL`) are preserved: they
   * predate the hybrid flow and are not eligible for this purge.
   *
   * Must be idempotent + safe to run concurrently with on-demand enrichment:
   * row-level DELETE is atomic per row.
   */
  deleteStaleSince(threshold: Date): Promise<number>;
}
