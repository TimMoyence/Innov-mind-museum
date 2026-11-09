import { errorMessage } from '@shared/errors/error-message';
import { logger } from '@shared/logger/logger';

import type {
  ArtworkFacts,
  KnowledgeBaseProvider,
  KnowledgeBaseQuery,
} from '@modules/chat/domain/ports/knowledge-base.port';
import type { WikidataKbDumpRepositoryPort } from '@modules/chat/domain/ports/wikidata-kb-dump.port';

export class WikidataWriteThroughProvider implements KnowledgeBaseProvider {
  constructor(
    private readonly inner: KnowledgeBaseProvider,
    private readonly dumpRepo: WikidataKbDumpRepositoryPort,
  ) {}

  async lookup(query: KnowledgeBaseQuery): Promise<ArtworkFacts | null> {
    const facts = await this.inner.lookup(query);
    if (facts !== null) {
      void this.persistAsync(query.searchTerm, query.language, facts);
    }
    return facts;
  }

  private async persistAsync(
    searchTerm: string,
    language: string | undefined,
    facts: ArtworkFacts,
  ): Promise<void> {
    try {
      await this.dumpRepo.upsert(searchTerm, language, facts);
    } catch (err) {
      logger.warn('kb_write_through_persist_error', {
        searchTerm,
        language: language ?? '',
        error: errorMessage(err),
      });
    }
  }
}
