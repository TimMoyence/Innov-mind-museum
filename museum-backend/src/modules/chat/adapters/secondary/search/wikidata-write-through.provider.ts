import { logger } from '@shared/logger/logger';

import type {
  ArtworkFacts,
  KnowledgeBaseProvider,
  KnowledgeBaseQuery,
} from '@modules/chat/domain/ports/knowledge-base.port';
import type { WikidataKbDumpRepositoryPort } from '@modules/chat/domain/ports/wikidata-kb-dump.port';

/**
 * C5.3, ADR-039 D4. Stack: `WikidataWriteThroughProvider` (this) → `WikidataBreakerClient`
 * (C5.1 opossum CB + null fallback) → `WikidataClient` (raw HTTP/SPARQL).
 *
 * Transparent on read path. Non-null facts → fire-and-forget UPSERT into
 * `wikidata_kb_dump` (next microtask, zero hot-path latency). Null facts → no
 * UPSERT (only persist real matches). Inner throws propagate verbatim (breaker
 * beneath handles resilience). UPSERT failure logged + swallowed in repo;
 * defense-in-depth `.catch` here prevents orphan rejection.
 *
 * `scripts/seed-kb-canon.ts` reuses the same UPSERT surface synchronously.
 */
export class WikidataWriteThroughProvider implements KnowledgeBaseProvider {
  constructor(
    private readonly inner: KnowledgeBaseProvider,
    private readonly dumpRepo: WikidataKbDumpRepositoryPort,
  ) {}

  async lookup(query: KnowledgeBaseQuery): Promise<ArtworkFacts | null> {
    const facts = await this.inner.lookup(query);
    if (facts !== null) {
      // Fire-and-forget — same pattern as `chat-phase-timer.ts:159-165`.
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
      // Defense in depth — repo contract swallows DB errors, but a custom impl
      // that rejects must not poison the chat path with orphan rejections.
      logger.warn('kb_write_through_persist_error', {
        searchTerm,
        language: language ?? '',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
