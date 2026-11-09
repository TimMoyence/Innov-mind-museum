import type { ArtworkFacts } from './knowledge-base.port';

export interface WikidataKbDumpRepositoryPort {
  findFactsBySearchTerm(searchTerm: string, language?: string): Promise<ArtworkFacts | null>;

  upsert(searchTerm: string, language: string | undefined, facts: ArtworkFacts): Promise<void>;
}

export class NoopWikidataKbDumpRepository implements WikidataKbDumpRepositoryPort {
  findFactsBySearchTerm(_searchTerm: string, _language?: string): Promise<ArtworkFacts | null> {
    return Promise.resolve(null);
  }

  upsert(_searchTerm: string, _language: string | undefined, _facts: ArtworkFacts): Promise<void> {
    return Promise.resolve();
  }
}
