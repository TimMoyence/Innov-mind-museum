import { logger } from '@shared/logger/logger';

import type {
  ArtworkFacts,
  KnowledgeBaseProvider,
  KnowledgeBaseQuery,
} from '@modules/chat/domain/ports/knowledge-base.port';
import type { WikidataKbDumpRepositoryPort } from '@modules/chat/domain/ports/wikidata-kb-dump.port';

/**
 * Write-through cache decorator for the Wikidata provider chain (C5.3,
 * ADR-039 D4).
 *
 * Stack composition (composition root in `chat-module.ts`, Phase B wiring) :
 *
 *   `WikidataWriteThroughProvider`     ← this class (persists every success)
 *     └─ `WikidataBreakerClient`       ← C5.1 (opossum CB + null fallback)
 *          └─ `WikidataClient`         ← raw HTTP / SPARQL
 *
 * Semantics :
 *   - `lookup(query)` delegates to the inner provider unchanged. The
 *     decorator is transparent on the read path.
 *   - On a non-null facts result, the decorator schedules a *fire-and-forget*
 *     UPSERT into `wikidata_kb_dump` via {@link WikidataKbDumpRepositoryPort}.
 *     The chat path returns immediately ; the UPSERT runs on the next
 *     microtask. Latency impact on the hot path is therefore zero.
 *   - On a null facts result, no UPSERT runs — we only persist what the
 *     upstream considered a real match.
 *   - On an inner-provider throw, the throw propagates verbatim (the
 *     decorator does NOT swallow). The breaker beneath this layer already
 *     handles the resilience contract.
 *   - On an UPSERT failure, the error is logged and swallowed inside the
 *     repository (see `WikidataKbDumpRepositoryTypeOrm.upsert`). Even if
 *     that contract were violated, the decorator's `.catch` here guarantees
 *     no orphan rejection can crash the Node process.
 *
 * The seed script (`scripts/seed-kb-canon.ts`) reuses the same UPSERT
 * surface synchronously (one-shot bulk write), so the same persistence
 * shape ends up populating the dump from both code paths.
 */
export class WikidataWriteThroughProvider implements KnowledgeBaseProvider {
  constructor(
    private readonly inner: KnowledgeBaseProvider,
    private readonly dumpRepo: WikidataKbDumpRepositoryPort,
  ) {}

  /** {@inheritDoc KnowledgeBaseProvider.lookup} */
  async lookup(query: KnowledgeBaseQuery): Promise<ArtworkFacts | null> {
    const facts = await this.inner.lookup(query);
    if (facts !== null) {
      // Fire-and-forget — same pattern as `chat-phase-timer.ts:159-165`.
      // `void` makes the unhandled-promise lint happy without awaiting.
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
      // Defense in depth — the repo contract already swallows DB errors,
      // but if a custom implementation rejects we still swallow here so
      // the chat path is never poisoned by an orphan rejection.
      logger.warn('kb_write_through_persist_error', {
        searchTerm,
        language: language ?? '',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
