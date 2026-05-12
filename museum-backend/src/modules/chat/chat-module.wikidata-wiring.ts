/**
 * C5.3 (2026-05-11) — Wikidata provider chain composition helper.
 *
 * Extracted from `chat-module.ts:build()` to keep that file under the
 * project-wide `max-lines: 400` cap — same precedent as
 * `chat-module.compare-wiring.ts` (T5.5) and
 * `chat-module.knowledge-router-wiring.ts` (C4.1 T3.3). Re-imported by
 * {@link ChatModule.build} which invokes {@link buildWikidataStack} once
 * per build cycle.
 *
 * Composition (outermost → innermost) :
 *
 *   WikidataWriteThroughProvider           ← C5.3 fire-and-forget UPSERT into dump
 *     └─ WikidataBreakerClient             ← C5.1 opossum CB + null fallback
 *          └─ WikidataClient               ← raw HTTP / SPARQL
 *
 * Both downstream consumers — `KnowledgeBaseService` (cache + cascade-aware)
 * AND `KnowledgeRouterService` (C4 cascade KB → judge → WebSearch) — share
 * the same `kbProvider` reference. Effect : the breaker state and the dump
 * write-through are shared across both legs ; the C4 router's calls
 * contribute to `wikidata_sparql_requests_total` and populate the local
 * dump alongside the cache-aware `KnowledgeBaseService`. Doctrine pré-launch
 * V1 — no `*_ENABLED` flag, rollback = `git revert` of the wiring.
 */
import { WikidataKbDumpRepositoryTypeOrm } from '@modules/chat/adapters/secondary/persistence/wikidata-kb-dump.repository.typeorm';
import { WikidataBreakerClient } from '@modules/chat/adapters/secondary/search/wikidata-breaker';
import { WikidataWriteThroughProvider } from '@modules/chat/adapters/secondary/search/wikidata-write-through.provider';
import { WikidataClient } from '@modules/chat/adapters/secondary/search/wikidata.client';
import { KnowledgeBaseService } from '@modules/chat/useCase/knowledge/knowledge-base.service';
import { env } from '@src/config/env';

import type { KnowledgeBaseProvider } from '@modules/chat/domain/ports/knowledge-base.port';
import type { CacheService } from '@shared/cache/cache.port';
import type { DataSource } from 'typeorm';

/**
 * Return shape consumed by `ChatModule.build()`. The `kbProvider` is also
 * fed verbatim to `buildKnowledgeRouter` (C4) so both legs share the same
 * decorator chain.
 */
export interface WikidataStack {
  readonly kbProvider: KnowledgeBaseProvider;
  readonly knowledgeBase: KnowledgeBaseService;
}

/**
 * Assemble the Wikidata provider chain + the cache + cascade-aware
 * `KnowledgeBaseService`. Pure factory — the cascade deps (breaker state
 * callback + dump repo) are bound internally so the caller never sees them.
 */
export function buildWikidataStack(dataSource: DataSource, cache?: CacheService): WikidataStack {
  const wikidataClient = new WikidataClient({ userAgent: env.wikidata.userAgent });
  const wikidataBreaker = new WikidataBreakerClient(wikidataClient, env.knowledgeBase.breaker);
  const wikidataDumpRepo = new WikidataKbDumpRepositoryTypeOrm(dataSource);
  const kbProvider = new WikidataWriteThroughProvider(wikidataBreaker, wikidataDumpRepo);
  const { timeoutMs, cacheTtlSeconds, cacheMaxEntries, localDumpFallbackAfterMs } =
    env.knowledgeBase;
  const knowledgeBase = new KnowledgeBaseService(
    kbProvider,
    { timeoutMs, cacheTtlSeconds, cacheMaxEntries, localDumpFallbackAfterMs },
    cache,
    {
      breakerState: () => wikidataBreaker.getState(),
      dumpRepo: wikidataDumpRepo,
    },
  );
  return { kbProvider, knowledgeBase };
}
