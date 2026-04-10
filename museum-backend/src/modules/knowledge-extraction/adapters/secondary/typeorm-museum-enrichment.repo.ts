import type { MuseumEnrichment } from '../../domain/museum-enrichment.entity';
import type { Repository } from 'typeorm';

/**
 *
 */
export class TypeOrmMuseumEnrichmentRepo {
  constructor(private readonly repo: Repository<MuseumEnrichment>) {}

  /** Finds museum enrichment by exact name match (case-insensitive) and locale. */
  async findByNameAndLocale(name: string, locale: string): Promise<MuseumEnrichment | null> {
    return await this.repo
      .createQueryBuilder('me')
      .where('LOWER(me.name) = LOWER(:name)', { name })
      .andWhere('me.locale = :locale', { locale })
      .getOne();
  }

  /**
   *
   */
  /** Fuzzy-searches museums by name using ILIKE, ordered by confidence. */
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

  /**
   *
   */
  /** Inserts or merges classified museum data; higher confidence overwrites, lower fills nulls. */
  async upsertFromClassification(
    data: Omit<MuseumEnrichment, 'id' | 'museum' | 'createdAt' | 'updatedAt'>,
    sourceUrl: string,
  ): Promise<MuseumEnrichment> {
    const existing = await this.findByNameAndLocale(data.name, data.locale);
    if (existing) {
      if (!existing.sourceUrls.includes(sourceUrl)) {
        existing.sourceUrls = [...existing.sourceUrls, sourceUrl];
      }
      if (data.confidence > existing.confidence) {
        Object.assign(existing, data, {
          id: existing.id,
          museumId: existing.museumId,
          sourceUrls: existing.sourceUrls,
          createdAt: existing.createdAt,
        });
      } else {
        for (const key of [
          'openingHours',
          'admissionFees',
          'website',
          'collections',
          'currentExhibitions',
          'accessibility',
        ] as const) {
          if (existing[key] === null && data[key] !== null) {
            (existing as unknown as Record<string, unknown>)[key] = data[key];
          }
        }
      }
      existing.needsReview = data.needsReview;
      return await this.repo.save(existing);
    }
    return await this.repo.save(this.repo.create({ ...data, sourceUrls: [sourceUrl] }));
  }
}
