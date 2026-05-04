import { MuseumQaSeed } from '@modules/museum/domain/qa-seed/museumQaSeed.entity';

import type { MuseumQaSeedRepository } from '@modules/museum/domain/qa-seed/museumQaSeed.repository.interface';
import type { DataSource, Repository } from 'typeorm';

/** TypeORM implementation of the museum Q&A seed repository. */
export class MuseumQaSeedRepositoryPg implements MuseumQaSeedRepository {
  private readonly repo: Repository<MuseumQaSeed>;

  constructor(dataSource: DataSource) {
    this.repo = dataSource.getRepository(MuseumQaSeed);
  }

  /** Finds all seeded Q&A entries for a given museum and locale, ordered by creation date. */
  async findByMuseumAndLocale(museumId: string, locale: string): Promise<MuseumQaSeed[]> {
    return await this.repo.find({
      where: { museumId, locale },
      order: { createdAt: 'ASC' },
    });
  }
}
