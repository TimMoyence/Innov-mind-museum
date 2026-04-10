import type { ArtworkKnowledge } from '../../domain/artwork-knowledge.entity';
import type { Repository } from 'typeorm';

/**
 *
 */
export class TypeOrmArtworkKnowledgeRepo {
  constructor(private readonly repo: Repository<ArtworkKnowledge>) {}

  /** Finds artwork by exact title match (case-insensitive) and locale. */
  async findByTitleAndLocale(title: string, locale: string): Promise<ArtworkKnowledge | null> {
    return await this.repo
      .createQueryBuilder('ak')
      .where('LOWER(ak.title) = LOWER(:title)', { title })
      .andWhere('ak.locale = :locale', { locale })
      .getOne();
  }

  /**
   *
   */
  /** Fuzzy-searches artworks by title using ILIKE, ordered by confidence. */
  async searchByTitle(searchTerm: string, locale: string, limit = 3): Promise<ArtworkKnowledge[]> {
    return await this.repo
      .createQueryBuilder('ak')
      .where('ak.title ILIKE :term', { term: `%${searchTerm}%` })
      .andWhere('ak.locale = :locale', { locale })
      .andWhere('ak.needsReview = :needsReview', { needsReview: false })
      .andWhere('ak.confidence >= :threshold', { threshold: 0.4 })
      .orderBy('ak.confidence', 'DESC')
      .limit(limit)
      .getMany();
  }

  /**
   *
   */
  /** Inserts or merges classified artwork data; higher confidence overwrites, lower fills nulls. */
  async upsertFromClassification(
    data: Omit<ArtworkKnowledge, 'id' | 'createdAt' | 'updatedAt'>,
    sourceUrl: string,
  ): Promise<ArtworkKnowledge> {
    const existing = await this.findByTitleAndLocale(data.title, data.locale);
    if (existing) {
      if (!existing.sourceUrls.includes(sourceUrl)) {
        existing.sourceUrls = [...existing.sourceUrls, sourceUrl];
      }
      if (data.confidence > existing.confidence) {
        Object.assign(existing, data, {
          id: existing.id,
          sourceUrls: existing.sourceUrls,
          createdAt: existing.createdAt,
        });
      } else {
        for (const key of [
          'artist',
          'period',
          'technique',
          'historicalContext',
          'dimensions',
          'currentLocation',
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
