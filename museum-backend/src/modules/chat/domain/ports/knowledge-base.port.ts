export interface ArtworkFacts {
  /** Wikidata QID (e.g. "Q12418" for Mona Lisa). */
  qid: string;
  title: string;
  artist?: string;
  date?: string;
  technique?: string;
  collection?: string;
  movement?: string;
  genre?: string;
  /** Wikidata P18 property. */
  imageUrl?: string;
  /**
   * `schema:alternateName` / `skos:altLabel` in resolved language. Fed into
   * alias-aware `titleMatchScore` (R8). C2 v2 — added 2026-05.
   */
  aliases?: string[];
}

export interface KnowledgeBaseQuery {
  searchTerm: string;
  language?: string;
}

export interface KnowledgeBaseServiceConfig {
  timeoutMs: number;
  cacheTtlSeconds: number;
  cacheMaxEntries: number;
  /**
   * Soak window the breaker must stay OPEN before the cascade consults the
   * local Wikidata dump (C5.3). Honored only when breaker + dump repo wired;
   * absent or `0` = dump consulted immediately on breaker OPEN.
   */
  localDumpFallbackAfterMs?: number;
}

export interface KnowledgeBaseProvider {
  /** Returns null if not found or on any error. */
  lookup(query: KnowledgeBaseQuery): Promise<ArtworkFacts | null>;
}

/** Fail-open. */
export class DisabledKnowledgeBaseProvider implements KnowledgeBaseProvider {
  // eslint-disable-next-line @typescript-eslint/require-await -- null-object pattern: interface requires async signature
  async lookup(): Promise<ArtworkFacts | null> {
    return null;
  }
}
