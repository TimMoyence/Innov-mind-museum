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
}
