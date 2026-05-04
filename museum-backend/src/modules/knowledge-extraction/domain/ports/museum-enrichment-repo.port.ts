import type { MuseumEnrichment } from '@modules/knowledge-extraction/domain/museum-enrichment/museum-enrichment.entity';

/** Port for museum enrichment persistence. */
export interface MuseumEnrichmentRepoPort {
  findByNameAndLocale(name: string, locale: string): Promise<MuseumEnrichment | null>;
  searchByName(searchTerm: string, locale: string, limit?: number): Promise<MuseumEnrichment[]>;
  upsertFromClassification(
    data: Omit<MuseumEnrichment, 'id' | 'museum' | 'createdAt' | 'updatedAt'>,
    sourceUrl: string,
  ): Promise<MuseumEnrichment>;
}
