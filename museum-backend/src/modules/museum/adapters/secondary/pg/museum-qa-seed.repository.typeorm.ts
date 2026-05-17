import { MuseumQaSeed } from '@modules/museum/domain/qa-seed/museumQaSeed.entity';

import type { MuseumQaSeedRepository } from '@modules/museum/domain/qa-seed/museumQaSeed.repository.interface';
import type { DataSource, Repository } from 'typeorm';

export class MuseumQaSeedRepositoryPg implements MuseumQaSeedRepository {
  private readonly repo: Repository<MuseumQaSeed>;

  constructor(dataSource: DataSource) {
    this.repo = dataSource.getRepository(MuseumQaSeed);
  }

  async findByMuseumAndLocale(museumId: string, locale: string): Promise<MuseumQaSeed[]> {
    return await this.repo.find({
      where: { museumId, locale },
      order: { createdAt: 'ASC' },
    });
  }
}
