import { confidenceUpsert } from '@shared/db/confidence-upsert';
import { logger } from '@shared/logger/logger';

import type { ArtworkKnowledge } from '@modules/knowledge-extraction/domain/artwork-knowledge/artwork-knowledge.entity';
import type { ArtworkKnowledgeRepoPort } from '@modules/knowledge-extraction/domain/ports/artwork-knowledge-repo.port';
import type { Repository } from 'typeorm';

export class TypeOrmArtworkKnowledgeRepo implements ArtworkKnowledgeRepoPort {
  constructor(private readonly repo: Repository<ArtworkKnowledge>) {}

  async findByTitleAndLocale(title: string, locale: string): Promise<ArtworkKnowledge | null> {
    return await this.repo
      .createQueryBuilder('ak')
      .where('LOWER(ak.title) = LOWER(:title)', { title })
      .andWhere('ak.locale = :locale', { locale })
      .getOne();
  }

  async findById(id: string, museumId?: number | null): Promise<ArtworkKnowledge | null> {
    const scopedMuseumId = typeof museumId === 'number' ? museumId : null;
    if (scopedMuseumId === null) {
      logger.warn('artwork_knowledge_find_by_id_unscoped', {
        reason: 'museumId not provided — global read (cross-tenant scope disabled)',
      });
    }
    return await this.repo
      .createQueryBuilder('ak')
      .where('ak.id = :id', { id })
      .andWhere(
        '(:museumId::integer IS NULL OR ak.museum_id IS NULL OR ak.museum_id = :museumId)',
        { museumId: scopedMuseumId },
      )
      .getOne();
  }

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

  async upsertFromClassification(
    data: Omit<ArtworkKnowledge, 'id' | 'createdAt' | 'updatedAt'>,
    sourceUrl: string,
  ): Promise<ArtworkKnowledge> {
    const existing = await this.findByTitleAndLocale(data.title, data.locale);
    if (existing) {
      return await this.repo.save(
        confidenceUpsert(existing, data, {
          sourceUrl,
          nullableFields: [
            'artist',
            'period',
            'technique',
            'historicalContext',
            'dimensions',
            'currentLocation',
          ],
          preserveFields: ['id', 'sourceUrls', 'createdAt'],
        }),
      );
    }
    return await this.repo.save(this.repo.create({ ...data, sourceUrls: [sourceUrl] }));
  }

  async findNeedsReview(limit = 50): Promise<ArtworkKnowledge[]> {
    return await this.repo.find({
      where: { needsReview: true },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async approve(id: string): Promise<ArtworkKnowledge | null> {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) return null;
    item.needsReview = false;
    return await this.repo.save(item);
  }
}
