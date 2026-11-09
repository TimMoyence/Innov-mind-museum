import { WikidataKbDump } from '@modules/chat/domain/wikidata-kb-dump.entity';
import { errorMessage } from '@shared/errors/error-message';
import { logger } from '@shared/logger/logger';

import type { ArtworkFacts } from '@modules/chat/domain/ports/knowledge-base.port';
import type { WikidataKbDumpRepositoryPort } from '@modules/chat/domain/ports/wikidata-kb-dump.port';
import type { DataSource, Repository } from 'typeorm';

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
        error: errorMessage(err),
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
        error: errorMessage(err),
      });
    }
  }

  private static normaliseKey(searchTerm: string): string {
    return searchTerm.toLowerCase().trim();
  }
}
