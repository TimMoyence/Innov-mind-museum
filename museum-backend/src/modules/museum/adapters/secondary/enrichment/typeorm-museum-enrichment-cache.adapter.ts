import { MuseumEnrichment } from '@modules/knowledge-extraction/domain/museum-enrichment/museum-enrichment.entity';
import { wikimediaHttps } from '@shared/media/wikimedia-https';

import type {
  MuseumEnrichmentView,
  ParsedOpeningHours,
} from '@modules/museum/domain/enrichment/enrichment.types';
import type { Museum } from '@modules/museum/domain/museum/museum.entity';
import type { MuseumEnrichmentCachePort } from '@modules/museum/domain/ports/museum-enrichment-cache.port';
import type { DataSource, Repository } from 'typeorm';

export class TypeOrmMuseumEnrichmentCacheAdapter implements MuseumEnrichmentCachePort {
  private readonly repo: Repository<MuseumEnrichment>;
  private readonly museumRepo: Repository<Museum>;

  constructor(dataSource: DataSource, museumEntity: typeof Museum) {
    this.repo = dataSource.getRepository(MuseumEnrichment);
    this.museumRepo = dataSource.getRepository(museumEntity);
  }

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
      openingHours: parsedToJsonb(input.openingHours),
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

  async deleteStaleSince(threshold: Date): Promise<number> {
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
  entity.openingHours = parsedToJsonb(view.openingHours);
  entity.fetchedAt = new Date(view.fetchedAt);
}

function parsedToJsonb(value: ParsedOpeningHours | null): Record<string, unknown> | null {
  return value === null ? null : { ...value };
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
    imageUrl: wikimediaHttps(row.imageUrl),
    openingHours: (row.openingHours ?? null) as ParsedOpeningHours | null,
    admissionFees: row.admissionFees ?? null,
    collections: row.collections ?? null,
    currentExhibitions: row.currentExhibitions ?? null,
    accessibility: row.accessibility ?? null,
    fetchedAt: row.fetchedAt.toISOString(),
  };
}
