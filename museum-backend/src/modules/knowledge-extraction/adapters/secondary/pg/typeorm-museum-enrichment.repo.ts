import { confidenceUpsert } from '@shared/db/confidence-upsert';

import type { MuseumEnrichment } from '@modules/knowledge-extraction/domain/museum-enrichment/museum-enrichment.entity';
import type { MuseumEnrichmentRepoPort } from '@modules/knowledge-extraction/domain/ports/museum-enrichment-repo.port';
import type { Repository } from 'typeorm';

export class TypeOrmMuseumEnrichmentRepo implements MuseumEnrichmentRepoPort {
  constructor(private readonly repo: Repository<MuseumEnrichment>) {}

  async findByNameAndLocale(name: string, locale: string): Promise<MuseumEnrichment | null> {
    return await this.repo
      .createQueryBuilder('me')
      .where('LOWER(me.name) = LOWER(:name)', { name })
      .andWhere('me.locale = :locale', { locale })
      .getOne();
  }

  async searchByName(searchTerm: string, locale: string, limit = 3): Promise<MuseumEnrichment[]> {
    return await this.repo
      .createQueryBuilder('me')
      .where('me.name ILIKE :term', { term: `%${searchTerm}%` })
      .andWhere('me.locale = :locale', { locale })
      .andWhere('me.needsReview = :needsReview', { needsReview: false })
      .andWhere('me.confidence >= :threshold', { threshold: 0.4 })
      .orderBy('me.confidence', 'DESC')
      .limit(limit)
      .getMany();
  }

  /** Higher confidence overwrites; lower fills nulls only. Mutates existing row. */
  async upsertFromClassification(
    data: Omit<MuseumEnrichment, 'id' | 'museum' | 'createdAt' | 'updatedAt'>,
    sourceUrl: string,
  ): Promise<MuseumEnrichment> {
    const existing = await this.findByNameAndLocale(data.name, data.locale);
    if (existing) {
      return await this.repo.save(
        confidenceUpsert(existing, data, {
          sourceUrl,
          nullableFields: [
            'openingHours',
            'admissionFees',
            'website',
            'collections',
            'currentExhibitions',
            'accessibility',
          ],
          preserveFields: ['id', 'museumId', 'sourceUrls', 'createdAt'],
        }),
      );
    }
    return await this.repo.save(this.repo.create({ ...data, sourceUrls: [sourceUrl] }));
  }
}
