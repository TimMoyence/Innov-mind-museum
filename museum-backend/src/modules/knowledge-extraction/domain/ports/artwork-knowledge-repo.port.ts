import type { ArtworkKnowledge } from '../artwork-knowledge.entity';

/** Port for artwork knowledge persistence. */
export interface ArtworkKnowledgeRepoPort {
  findByTitleAndLocale(title: string, locale: string): Promise<ArtworkKnowledge | null>;
  searchByTitle(searchTerm: string, locale: string, limit?: number): Promise<ArtworkKnowledge[]>;
  upsertFromClassification(
    data: Omit<ArtworkKnowledge, 'id' | 'createdAt' | 'updatedAt'>,
    sourceUrl: string,
  ): Promise<ArtworkKnowledge>;
}
