import type { ArtworkKnowledge } from '@modules/knowledge-extraction/domain/artwork-knowledge/artwork-knowledge.entity';

export interface ArtworkKnowledgeRepoPort {
  findByTitleAndLocale(title: string, locale: string): Promise<ArtworkKnowledge | null>;
  searchByTitle(searchTerm: string, locale: string, limit?: number): Promise<ArtworkKnowledge[]>;
  /**
   * W3 (T5.4) — UUID-keyed lookup used by the LLM prompt builder when the
   * visitor has scanned a cartel deeplink. Returns `null` for unknown ids
   * (legacy rows, malformed deeplinks that slipped past validation, races
   * with a deleted artwork).
   */
  findById(id: string): Promise<ArtworkKnowledge | null>;
  upsertFromClassification(
    data: Omit<ArtworkKnowledge, 'id' | 'createdAt' | 'updatedAt'>,
    sourceUrl: string,
  ): Promise<ArtworkKnowledge>;
  findNeedsReview(limit?: number): Promise<ArtworkKnowledge[]>;
  approve(id: string): Promise<ArtworkKnowledge | null>;
}
