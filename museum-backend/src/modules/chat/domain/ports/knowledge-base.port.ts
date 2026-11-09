export interface ArtworkFacts {
  qid: string;
  title: string;
  artist?: string;
  date?: string;
  technique?: string;
  collection?: string;
  movement?: string;
  genre?: string;
  imageUrl?: string;
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
  localDumpFallbackAfterMs?: number;
}

export interface KnowledgeBaseProvider {
  lookup(query: KnowledgeBaseQuery): Promise<ArtworkFacts | null>;
}

export class DisabledKnowledgeBaseProvider implements KnowledgeBaseProvider {
  lookup(): Promise<ArtworkFacts | null> {
    return Promise.resolve(null);
  }
}
