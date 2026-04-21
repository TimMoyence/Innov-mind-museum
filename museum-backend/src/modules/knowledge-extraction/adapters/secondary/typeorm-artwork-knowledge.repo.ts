import type { ArtworkKnowledge } from '../../domain/artwork-knowledge.entity';
import type { ArtworkKnowledgeRepoPort } from '../../domain/ports/artwork-knowledge-repo.port';
import type { Repository } from 'typeorm';

/**
 *
 */
export class TypeOrmArtworkKnowledgeRepo implements ArtworkKnowledgeRepoPort {
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
        type NullableField =
          | 'artist'
          | 'period'
          | 'technique'
          | 'historicalContext'
          | 'dimensions'
          | 'currentLocation';
        const nullableFields: NullableField[] = [
          'artist',
          'period',
          'technique',
          'historicalContext',
          'dimensions',
          'currentLocation',
        ];
        const patch: Partial<Pick<ArtworkKnowledge, NullableField>> = {};
        for (const key of nullableFields) {
          const incoming = data[key];
          if (existing[key] === null && incoming !== null) {
            patch[key] = incoming;
          }
        }
        Object.assign(existing, patch);
      }
      existing.needsReview = data.needsReview;
      return await this.repo.save(existing);
    }
    return await this.repo.save(this.repo.create({ ...data, sourceUrls: [sourceUrl] }));
  }

  /** Returns all artwork knowledge items flagged for human review, newest first. */
  async findNeedsReview(limit = 50): Promise<ArtworkKnowledge[]> {
    return await this.repo.find({
      where: { needsReview: true },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  /** Clears the needsReview flag for a given item. Returns null if the item does not exist. */
  async approve(id: string): Promise<ArtworkKnowledge | null> {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) return null;
    item.needsReview = false;
    return await this.repo.save(item);
  }
}
