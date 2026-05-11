import type { ArtworkFacts } from './knowledge-base.port';

/**
 * Local Wikidata dump fallback (C5.3) consulted by the cascade when the
 * SPARQL/API breaker has been OPEN long enough (`LOCAL_DUMP_FALLBACK_AFTER_MS`).
 *
 * V1 ships :
 *   - {@link NoopWikidataKbDumpRepository} — the original drop-in used by the
 *     cascade wiring while no real persistence exists.
 *   - `WikidataKbDumpRepositoryTypeOrm` (Phase 4-light, C5.3) — TypeORM-backed
 *     implementation persisting to the `wikidata_kb_dump` table. Populated
 *     organically via the {@link upsert} write-through pattern (every live
 *     Wikidata success is mirrored asynchronously) plus an optional one-shot
 *     canon seed script (`museum-backend/scripts/seed-kb-canon.ts`).
 *
 * The 150 GB monthly RDF-dump pipeline originally drafted in the launch
 * prompt was explicitly rejected (ADR-039 D4) in favour of this lighter
 * write-through strategy : table size scales linearly with real usage,
 * starts at zero, and stays accurate without any cron orchestration.
 */
export interface WikidataKbDumpRepositoryPort {
  /**
   * Resolve artwork facts from the locally-cached Wikidata dump.
   * Returns `null` when no matching entry exists or when the dump is empty.
   * MUST never throw — fail-open contract preserved (ADR-035).
   */
  findFactsBySearchTerm(searchTerm: string, language?: string): Promise<ArtworkFacts | null>;

  /**
   * Write-through cache UPSERT. Called fire-and-forget from the
   * `WikidataWriteThroughProvider` decorator after every successful live
   * lookup, and synchronously from the canon seed script. The
   * (searchTerm, language) tuple is the natural key — the same query later
   * resolves the same row via {@link findFactsBySearchTerm}.
   *
   * MUST never throw — fail-open contract. A write failure is logged and
   * swallowed ; the next live success will retry the UPSERT naturally.
   */
  upsert(searchTerm: string, language: string | undefined, facts: ArtworkFacts): Promise<void>;
}

/**
 * Null-object implementation : always resolves to `null`, swallows upserts.
 * Wired in {@link buildKnowledgeBase} until the C5.3 Phase B wiring step
 * promotes the TypeORM implementation in `chat-module.ts`.
 */
export class NoopWikidataKbDumpRepository implements WikidataKbDumpRepositoryPort {
  // eslint-disable-next-line @typescript-eslint/require-await, @typescript-eslint/no-unused-vars -- interface contract requires async signature with same parameter shape
  async findFactsBySearchTerm(_searchTerm: string, _language?: string): Promise<ArtworkFacts | null> {
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/require-await, @typescript-eslint/no-unused-vars -- interface contract requires async signature with same parameter shape
  async upsert(
    _searchTerm: string,
    _language: string | undefined,
    _facts: ArtworkFacts,
  ): Promise<void> {
    // no-op : the dump is not persisted in the null implementation
  }
}
