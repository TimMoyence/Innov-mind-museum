import type { ArtworkKnowledge } from '@modules/knowledge-extraction/domain/artwork-knowledge/artwork-knowledge.entity';

export interface ArtworkKnowledgeRepoPort {
  findByTitleAndLocale(title: string, locale: string): Promise<ArtworkKnowledge | null>;
  searchByTitle(searchTerm: string, locale: string, limit?: number): Promise<ArtworkKnowledge[]>;
  /**
   * W3 (T5.4) — UUID-keyed lookup used by the LLM prompt builder when the
   * visitor has scanned a cartel deeplink. Returns `null` for unknown ids
   * (legacy rows, malformed deeplinks that slipped past validation, races
   * with a deleted artwork).
   *
   * I-SEC8 (OWASP LLM08) — `museumId` scopes the read to the requesting
   * session's tenant: a row with `museum_id IS NULL` (global public catalog)
   * is visible to every tenant, while a row with `museum_id = X` is returned
   * ONLY when `museumId === X`. A cross-tenant row therefore resolves to
   * `null` (treated identically to an unknown id). Omitting `museumId`
   * (`undefined`/`null`) performs a legacy global-only read and emits a
   * grep-able unscoped warn so unscoped callers can be audited before the
   * first B2B onboarding (mirror of the C7 `artwork_embeddings` precedent).
   */
  findById(id: string, museumId?: number | null): Promise<ArtworkKnowledge | null>;
  upsertFromClassification(
    data: Omit<ArtworkKnowledge, 'id' | 'createdAt' | 'updatedAt'>,
    sourceUrl: string,
  ): Promise<ArtworkKnowledge>;
  findNeedsReview(limit?: number): Promise<ArtworkKnowledge[]>;
  approve(id: string): Promise<ArtworkKnowledge | null>;
}
