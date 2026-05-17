import type { ArtworkFacts } from './knowledge-base.port';

/**
 * Local Wikidata dump fallback (C5.3) consulted by the cascade when the
 * SPARQL/API breaker has been OPEN past `LOCAL_DUMP_FALLBACK_AFTER_MS`.
 *
 * V1 ships {@link NoopWikidataKbDumpRepository} (test stub) +
 * `WikidataKbDumpRepositoryTypeOrm` (production, C5.3 Phase B), populated
 * organically via {@link upsert} write-through after every live Wikidata
 * success + optional canon seed (`scripts/seed-kb-canon.ts`).
 *
 * 150GB monthly RDF-dump pipeline was rejected (ADR-039 D4) in favour of this
 * write-through: table size scales linearly with real usage, no cron needed.
 */
export interface WikidataKbDumpRepositoryPort {
  /**
   * Returns `null` when no matching entry exists or dump is empty.
   * MUST never throw — fail-open (ADR-035).
   */
  findFactsBySearchTerm(searchTerm: string, language?: string): Promise<ArtworkFacts | null>;

  /**
   * Write-through UPSERT, fire-and-forget from `WikidataWriteThroughProvider`
   * after every successful live lookup. (searchTerm, language) = natural key,
   * matched by {@link findFactsBySearchTerm}.
   *
   * MUST never throw — fail-open. Write failures logged + swallowed; next live
   * success retries naturally.
   */
  upsert(searchTerm: string, language: string | undefined, facts: ArtworkFacts): Promise<void>;
}

/** Test stub — always `null`, swallows upserts. */
export class NoopWikidataKbDumpRepository implements WikidataKbDumpRepositoryPort {
  // eslint-disable-next-line @typescript-eslint/require-await -- interface contract requires async signature
  async findFactsBySearchTerm(
    _searchTerm: string,
    _language?: string,
  ): Promise<ArtworkFacts | null> {
    return null;
  }

  async upsert(
    _searchTerm: string,
    _language: string | undefined,
    _facts: ArtworkFacts,
  ): Promise<void> {
    // no-op : the dump is not persisted in the null implementation
  }
}
