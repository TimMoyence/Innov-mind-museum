import { MuseumEnrichment } from '@modules/knowledge-extraction/domain/museum-enrichment/museum-enrichment.entity';

import type {
  MuseumEnrichmentView,
  ParsedOpeningHours,
} from '../../../domain/enrichment/enrichment.types';
import type { Museum } from '../../../domain/museum/museum.entity';
import type { MuseumEnrichmentCachePort } from '../../../domain/ports/museum-enrichment-cache.port';
import type { DataSource, Repository } from 'typeorm';

/**
 * TypeORM adapter for {@link MuseumEnrichmentCachePort}.
 *
 * Shares the `museum_enrichment` table with the legacy
 * knowledge-extraction repository — new rows written by the hybrid flow have
 * a non-null `museumId` (and so never collide on the legacy name-based unique
 * index since they come with a distinct museum-specific locale key).
 */
export class TypeOrmMuseumEnrichmentCacheAdapter implements MuseumEnrichmentCachePort {
  private readonly repo: Repository<MuseumEnrichment>;
  private readonly museumRepo: Repository<Museum>;

  constructor(dataSource: DataSource, museumEntity: typeof Museum) {
    this.repo = dataSource.getRepository(MuseumEnrichment);
    this.museumRepo = dataSource.getRepository(museumEntity);
  }

  /**
   * Looks up a cached enrichment row that is still within `freshWindowMs`
   * of `now`. Returns `null` if the row is missing or stale so the use case
   * can fall back to enqueuing a refresh job.
   */
  async findFresh(input: {
    museumId: number;
    locale: string;
    freshWindowMs: number;
    now?: Date;
  }): Promise<MuseumEnrichmentView | null> {
    const now = input.now ?? new Date();
    const threshold = new Date(now.getTime() - input.freshWindowMs);

    const row = await this.repo
      .createQueryBuilder('me')
      .where('me.museumId = :museumId', { museumId: input.museumId })
      .andWhere('me.locale = :locale', { locale: input.locale })
      .andWhere('me.fetchedAt > :threshold', { threshold })
      .getOne();

    return row ? toView(row) : null;
  }

  /**
   * Inserts or updates the cached enrichment row for `(museumId, locale)`.
   * Uses a read-then-save strategy (rather than `INSERT ... ON CONFLICT`) so
   * we can preserve legacy columns set by the knowledge-extraction flow.
   */
  async upsert(input: MuseumEnrichmentView): Promise<void> {
    const existing = await this.repo
      .createQueryBuilder('me')
      .where('me.museumId = :museumId', { museumId: input.museumId })
      .andWhere('me.locale = :locale', { locale: input.locale })
      .getOne();

    if (existing) {
      applyViewToEntity(existing, input);
      await this.repo.save(existing);
      return;
    }

    const museum = await this.museumRepo.findOne({ where: { id: input.museumId } });
    const name = museum?.name ?? `museum-${String(input.museumId)}`;

    const fresh = this.repo.create({
      museumId: input.museumId,
      name,
      locale: input.locale,
      summary: input.summary,
      wikidataQid: input.wikidataQid,
      website: input.website,
      phone: input.phone,
      imageUrl: input.imageUrl,
      openingHours: input.openingHours as unknown as Record<string, unknown> | null,
      admissionFees: null,
      collections: null,
      currentExhibitions: null,
      accessibility: null,
      sourceUrls: [],
      confidence: 0.8,
      needsReview: false,
      fetchedAt: new Date(input.fetchedAt),
    });
    await this.repo.save(fresh);
  }

  /**
   * Returns the oldest stale rows for the daily refresh scan. Only rows with
   * a non-null `museumId` are considered — legacy name-keyed rows predate the
   * hybrid flow and are excluded from scheduled refresh.
   */
  async findStaleRows(
    thresholdDate: Date,
    limit: number,
  ): Promise<{ museumId: number; locale: string }[]> {
    const rows = await this.repo
      .createQueryBuilder('me')
      .select(['me.museumId', 'me.locale'])
      .where('me.fetchedAt < :threshold', { threshold: thresholdDate })
      .andWhere('me.museumId IS NOT NULL')
      .orderBy('me.fetchedAt', 'ASC')
      .limit(limit)
      .getMany();

    return rows
      .filter((row): row is typeof row & { museumId: number } => row.museumId != null)
      .map((row) => ({ museumId: row.museumId, locale: row.locale }));
  }

  /**
   * Deletes every hybrid-flow enrichment row older than `threshold`. Legacy
   * name-keyed rows (`museumId IS NULL`) are left untouched — they predate the
   * hybrid flow and are outside the scope of the scheduled purge.
   */
  async deleteStaleSince(threshold: Date): Promise<number> {
    // Column identifiers are quoted to preserve camelCase casing — bare
    // references would be lowercased by Postgres and fail to resolve.
    const result = await this.repo
      .createQueryBuilder()
      .delete()
      .from(MuseumEnrichment)
      .where('"fetchedAt" < :threshold', { threshold })
      .andWhere('"museumId" IS NOT NULL')
      .execute();

    return result.affected ?? 0;
  }
}

function applyViewToEntity(entity: MuseumEnrichment, view: MuseumEnrichmentView): void {
  entity.summary = view.summary;
  entity.wikidataQid = view.wikidataQid;
  entity.website = view.website;
  entity.phone = view.phone;
  entity.imageUrl = view.imageUrl;
  entity.openingHours = view.openingHours as unknown as Record<string, unknown> | null;
  entity.fetchedAt = new Date(view.fetchedAt);
}

function toView(row: MuseumEnrichment): MuseumEnrichmentView {
  if (row.museumId == null) {
    throw new Error(
      `museum_enrichment row ${row.id} has no museumId — legacy row cannot be mapped`,
    );
  }
  return {
    museumId: row.museumId,
    locale: row.locale,
    summary: row.summary,
    wikidataQid: row.wikidataQid,
    website: row.website,
    phone: row.phone,
    imageUrl: row.imageUrl,
    openingHours: (row.openingHours ?? null) as ParsedOpeningHours | null,
    fetchedAt: row.fetchedAt.toISOString(),
  };
}
