import type { MuseumEnrichment } from '@modules/knowledge-extraction/domain/museum-enrichment/museum-enrichment.entity';
import type { MuseumEnrichmentRepoPort } from '@modules/knowledge-extraction/domain/ports/museum-enrichment-repo.port';
import type { Repository } from 'typeorm';

/**
 *
 */
export class TypeOrmMuseumEnrichmentRepo implements MuseumEnrichmentRepoPort {
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
        // Backfill nullable fields when the new payload provides a value but
        // the stored row didn't. The per-key generic preserves the variance
        // proof that `data[K]` is assignable to `existing[K]` for each K.
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- Justification: K constrains input to bind data[K] and existing[K] together for the assignment at L64; without it TypeScript widens to a union value type that's not assignable. Approved-by: tim@2026-05-05
        const fillIfNull = <K extends keyof typeof data & keyof MuseumEnrichment>(
          key: K,
        ): void => {
          if (existing[key] === null && data[key] !== null) {
            existing[key] = data[key];
          }
        };
        for (const key of [
          'openingHours',
          'admissionFees',
          'website',
          'collections',
          'currentExhibitions',
          'accessibility',
        ] as const) {
          fillIfNull(key);
        }
      }
      existing.needsReview = data.needsReview;
      return await this.repo.save(existing);
    }
    return await this.repo.save(this.repo.create({ ...data, sourceUrls: [sourceUrl] }));
  }
}
