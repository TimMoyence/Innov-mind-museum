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
}

/** Port for knowledge base providers (e.g., Wikidata). */
export interface KnowledgeBaseProvider {
  /** Looks up artwork facts. Returns null if not found or on any error. */
  lookup(query: KnowledgeBaseQuery): Promise<ArtworkFacts | null>;
}

/** Disabled stub that always returns null (fail-open). */
export class DisabledKnowledgeBaseProvider implements KnowledgeBaseProvider {
  /** Returns null — knowledge base is disabled. */
  // eslint-disable-next-line @typescript-eslint/require-await
  async lookup(): Promise<ArtworkFacts | null> {
    return null;
  }
}
