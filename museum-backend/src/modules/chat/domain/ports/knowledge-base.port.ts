/** Verified facts about an artwork from a knowledge base. */
export interface ArtworkFacts {
  /** Wikidata QID (e.g., "Q12418" for Mona Lisa). */
  qid: string;
  /** Canonical title of the artwork. */
  title: string;
  /** Creator/artist name. */
  artist?: string;
  /** Creation date or period (e.g., "c. 1503"). */
  date?: string;
  /** Material or technique (e.g., "Oil on poplar panel"). */
  technique?: string;
  /** Museum or collection holding the artwork. */
  collection?: string;
  /** Art movement (e.g., "High Renaissance"). */
  movement?: string;
  /** Genre (e.g., "portrait"). */
  genre?: string;
  /** Primary image URL from Wikidata (P18 property). */
  imageUrl?: string;
  /**
   * Alternate-name labels (`schema:alternateName` / `skos:altLabel`) in the
   * resolved language, fed into the alias-aware `titleMatchScore` (R8).
   * Empty when no aliases are present in Wikidata for the entity.
   *
   * C2 v2 — added 2026-05.
   */
  aliases?: string[];
}

/** Query input for knowledge base lookup. */
export interface KnowledgeBaseQuery {
  /** Search term to look up in the knowledge base. */
  searchTerm: string;
  /** Optional language code for localized results. */
  language?: string;
}

/** Configuration for the knowledge base service. */
export interface KnowledgeBaseServiceConfig {
  /** Timeout in milliseconds for knowledge base requests. */
  timeoutMs: number;
  /** Cache time-to-live in seconds. */
  cacheTtlSeconds: number;
  /** Maximum number of entries in the cache. */
  cacheMaxEntries: number;
  /**
   * Soak window (ms) the underlying breaker must stay OPEN before the
   * cascade consults the local Wikidata dump (C5.3). Honored only when a
   * breaker + dump repository are both wired ; absent or `0` means the
   * dump is consulted immediately on a breaker OPEN.
   */
  localDumpFallbackAfterMs?: number;
}

/** Port for knowledge base providers (e.g., Wikidata). */
export interface KnowledgeBaseProvider {
  /** Looks up artwork facts. Returns null if not found or on any error. */
  lookup(query: KnowledgeBaseQuery): Promise<ArtworkFacts | null>;
}

/** Disabled stub that always returns null (fail-open). */
export class DisabledKnowledgeBaseProvider implements KnowledgeBaseProvider {
  /** Returns null — knowledge base is disabled. */
  // eslint-disable-next-line @typescript-eslint/require-await -- null-object pattern: interface requires async signature
  async lookup(): Promise<ArtworkFacts | null> {
    return null;
  }
}
