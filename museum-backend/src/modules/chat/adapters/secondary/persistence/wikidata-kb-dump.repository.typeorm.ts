import { WikidataKbDump } from '@modules/chat/domain/wikidata-kb-dump.entity';
import { logger } from '@shared/logger/logger';

import type { ArtworkFacts } from '@modules/chat/domain/ports/knowledge-base.port';
import type { WikidataKbDumpRepositoryPort } from '@modules/chat/domain/ports/wikidata-kb-dump.port';
import type { DataSource, Repository } from 'typeorm';

/**
 * C5.3 write-through cache (ADR-039 D4) — every successful live Wikidata lookup mirrors
 * its facts here via `WikidataWriteThroughProvider`; cascade reads them when breaker
 * has been OPEN past `LOCAL_DUMP_FALLBACK_AFTER_MS`.
 *
 * Key normalisation `searchTerm.toLowerCase().trim()` mirrors `knowledge-base.service.ts`
 * (`kb:wikidata:<key>`) — MUST normalise on both reads and writes.
 *
 * `language` sentinel: entity column is `NOT NULL DEFAULT ''` because PG treats NULL as
 * distinct in UNIQUE indexes — leaving NULL would accumulate duplicates. `undefined`
 * coerced to `''`.
 *
 * Fail-open: every op swallows DB errors (logs `kb_dump_*_error`). Chat path treats
 * a degraded dump as empty.
 */
export class WikidataKbDumpRepositoryTypeOrm implements WikidataKbDumpRepositoryPort {
  private readonly repo: Repository<WikidataKbDump>;

  constructor(dataSource: DataSource) {
    this.repo = dataSource.getRepository(WikidataKbDump);
  }

  async findFactsBySearchTerm(searchTerm: string, language?: string): Promise<ArtworkFacts | null> {
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

  async upsert(
    searchTerm: string,
    language: string | undefined,
    facts: ArtworkFacts,
  ): Promise<void> {
    const key = WikidataKbDumpRepositoryTypeOrm.normaliseKey(searchTerm);
    if (!key) return;
    try {
      // `updated_at` bumps automatically via `@UpdateDateColumn`.
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
   * Mirrors `knowledge-base.service.ts:64`. Empty string = "no lookup, no write" signal —
   * both `findFactsBySearchTerm` and `upsert` short-circuit on it.
   */
  private static normaliseKey(searchTerm: string): string {
    return searchTerm.toLowerCase().trim();
  }
}
