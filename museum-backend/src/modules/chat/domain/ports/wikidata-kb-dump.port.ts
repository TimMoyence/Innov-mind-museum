import type { ArtworkFacts } from './knowledge-base.port';

/**
 * Local Wikidata dump fallback (C5.3) consulted by the cascade when the
 * SPARQL/API breaker has been OPEN long enough (`LOCAL_DUMP_FALLBACK_AFTER_MS`).
 *
 * V1 ships a no-op implementation ({@link NoopWikidataKbDumpRepository}) so
 * the cascade can wire today ; a TypeORM-backed implementation reading from
 * the `wikidata_kb_dump` table will land with Phase 4 (migration + weekly
 * ingest pipeline).
 */
export interface WikidataKbDumpRepositoryPort {
  /**
   * Resolve artwork facts from the locally-cached Wikidata dump.
   * Returns `null` when no matching entry exists or when the dump is empty.
   * MUST never throw — fail-open contract preserved (ADR-035).
   */
  findFactsBySearchTerm(searchTerm: string, language?: string): Promise<ArtworkFacts | null>;
}

/**
 * Null-object implementation : always resolves to `null`.
 * Wired in {@link buildKnowledgeBase} until the Phase 4 ingest pipeline lands.
 */
export class NoopWikidataKbDumpRepository implements WikidataKbDumpRepositoryPort {
  // eslint-disable-next-line @typescript-eslint/require-await, @typescript-eslint/no-unused-vars -- interface contract requires async signature with same parameter shape
  async findFactsBySearchTerm(_searchTerm: string, _language?: string): Promise<ArtworkFacts | null> {
    return null;
  }
}
