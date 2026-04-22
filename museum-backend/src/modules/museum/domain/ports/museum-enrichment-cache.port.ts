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
}
