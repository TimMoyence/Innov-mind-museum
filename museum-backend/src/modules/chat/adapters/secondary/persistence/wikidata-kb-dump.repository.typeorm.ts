import { WikidataKbDump } from '@modules/chat/domain/wikidata-kb-dump.entity';
import { logger } from '@shared/logger/logger';

import type { ArtworkFacts } from '@modules/chat/domain/ports/knowledge-base.port';
import type { WikidataKbDumpRepositoryPort } from '@modules/chat/domain/ports/wikidata-kb-dump.port';
import type { DataSource, Repository } from 'typeorm';

/**
 * TypeORM-backed implementation of {@link WikidataKbDumpRepositoryPort}.
 *
 * Persistence layer for the C5.3 write-through cache (ADR-039 D4) — every
 * successful live Wikidata lookup mirrors its facts here via the
 * `WikidataWriteThroughProvider` decorator, and the cascade reads them back
 * when the breaker has been OPEN past `LOCAL_DUMP_FALLBACK_AFTER_MS`.
 *
 * Key normalisation : `searchTerm.toLowerCase().trim()` matches the cache
 * key shape used in `knowledge-base.service.ts` (`kb:wikidata:<key>`). The
 * repo MUST normalise on both reads and writes so callers cannot accidentally
 * stash one capitalisation and miss the other.
 *
 * `language` sentinel : the entity column is `NOT NULL DEFAULT ''` because
 * PostgreSQL treats `NULL` as distinct in `UNIQUE` indexes — leaving
 * `language` NULL would allow the write-through to accumulate duplicates.
 * `undefined` from callers is coerced to `''` before any SQL touches the row.
 *
 * Fail-open : every operation swallows DB errors (logs `kb_dump_*_error` for
 * Loki). `findFactsBySearchTerm` returns `null` on error ; `upsert` returns
 * `void`. The chat path treats a degraded dump as if it were empty.
 */
export class WikidataKbDumpRepositoryTypeOrm implements WikidataKbDumpRepositoryPort {
  private readonly repo: Repository<WikidataKbDump>;

  constructor(dataSource: DataSource) {
    this.repo = dataSource.getRepository(WikidataKbDump);
  }

  /** {@inheritDoc WikidataKbDumpRepositoryPort.findFactsBySearchTerm} */
  async findFactsBySearchTerm(
    searchTerm: string,
    language?: string,
  ): Promise<ArtworkFacts | null> {
    const key = WikidataKbDumpRepositoryTypeOrm.normaliseKey(searchTerm);
    if (!key) return null;
    try {
      const row = await this.repo.findOne({
        where: { searchTerm: key, language: language ?? '' },
      });
      return row?.facts ?? null;
    } catch (err) {
      logger.warn('kb_dump_lookup_error', {
        searchTerm: key,
        language: language ?? '',
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  /** {@inheritDoc WikidataKbDumpRepositoryPort.upsert} */
  async upsert(
    searchTerm: string,
    language: string | undefined,
    facts: ArtworkFacts,
  ): Promise<void> {
    const key = WikidataKbDumpRepositoryTypeOrm.normaliseKey(searchTerm);
    if (!key) return;
    try {
      // Postgres `INSERT ... ON CONFLICT (search_term, language) DO UPDATE`.
      // TypeORM emits the matching SQL via `Repository.upsert` with
      // `conflictPaths` aligned to the entity column names. `updated_at`
      // bumps automatically via the `@UpdateDateColumn` decorator.
      await this.repo.upsert(
        {
          searchTerm: key,
          language: language ?? '',
          qid: facts.qid,
          facts,
        },
        {
          conflictPaths: ['searchTerm', 'language'],
          skipUpdateIfNoValuesChanged: true,
        },
      );
    } catch (err) {
      logger.warn('kb_dump_upsert_error', {
        searchTerm: key,
        language: language ?? '',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Mirror of the cache key normalisation in `knowledge-base.service.ts:64`.
   * Returning the empty string is the "no lookup, no write" signal — both
   * `findFactsBySearchTerm` and `upsert` short-circuit on it.
   */
  private static normaliseKey(searchTerm: string): string {
    return searchTerm.toLowerCase().trim();
  }
}
