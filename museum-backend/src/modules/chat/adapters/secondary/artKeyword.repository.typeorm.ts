import { ArtKeyword } from '../../domain/artKeyword.entity';

import type { ArtKeywordRepository } from '../../domain/artKeyword.repository.interface';
import type { DataSource, Repository } from 'typeorm';

/**
 *
 */
export class TypeOrmArtKeywordRepository implements ArtKeywordRepository {
  private readonly repo: Repository<ArtKeyword>;

  constructor(dataSource: DataSource) {
    this.repo = dataSource.getRepository(ArtKeyword);
  }

  /** Finds art keywords by locale, ordered by hit count descending. */
  async findByLocale(locale: string): Promise<ArtKeyword[]> {
    if (locale === '%') {
      return await this.repo.find({ order: { hitCount: 'DESC' } });
    }
    return await this.repo.find({ where: { locale }, order: { hitCount: 'DESC' } });
  }

  /** Finds art keywords updated after the given date, optionally filtered by locale. */
  async findByLocaleSince(locale: string, since: Date): Promise<ArtKeyword[]> {
    const qb = this.repo
      .createQueryBuilder('kw')
      .where('kw.updatedAt > :since', { since })
      .orderBy('kw.hitCount', 'DESC');
    if (locale !== '%') {
      qb.andWhere('kw.locale = :locale', { locale });
    }
    return await qb.getMany();
  }

  /** Inserts a keyword or increments its hit count if it already exists. */
  async upsert(keyword: string, locale: string): Promise<ArtKeyword> {
    const normalized = keyword.toLowerCase().trim();
    const existing = await this.repo.findOne({ where: { keyword: normalized, locale } });
    if (existing) {
      existing.hitCount += 1;
      return await this.repo.save(existing);
    }
    return await this.repo.save(this.repo.create({ keyword: normalized, locale, hitCount: 1 }));
  }

  /** Bulk upserts multiple keywords, incrementing hit counts on conflict. */
  async bulkUpsert(keywords: string[], locale: string): Promise<void> {
    if (keywords.length === 0) return;
    const normalized = [...new Set(keywords.map((k) => k.toLowerCase().trim()).filter(Boolean))];
    if (normalized.length === 0) return;
    const values = normalized
      .map((_, i) => `($${String(i * 2 + 1)}, $${String(i * 2 + 2)}, 1)`)
      .join(', ');
    const params = normalized.flatMap((kw) => [kw, locale]);
    await this.repo.query(
      `INSERT INTO "art_keywords" ("keyword", "locale", "hitCount")
       VALUES ${values}
       ON CONFLICT ("keyword", "locale") DO UPDATE SET "hitCount" = "art_keywords"."hitCount" + 1, "updatedAt" = NOW()`,
      params,
    );
  }
}
