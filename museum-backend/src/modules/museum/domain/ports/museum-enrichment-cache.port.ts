import type { MuseumEnrichmentView } from '@modules/museum/domain/enrichment/enrichment.types';

export interface MuseumEnrichmentCachePort {
  findFresh(input: {
    museumId: number;
    locale: string;
    freshWindowMs: number;
    now?: Date;
  }): Promise<MuseumEnrichmentView | null>;

  upsert(input: MuseumEnrichmentView): Promise<void>;

  findStaleRows(
    thresholdDate: Date,
    limit: number,
  ): Promise<{ museumId: number; locale: string }[]>;

  deleteStaleSince(threshold: Date): Promise<number>;
}
