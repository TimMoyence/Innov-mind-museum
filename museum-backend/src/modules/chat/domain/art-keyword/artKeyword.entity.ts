import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Crowdsourced art keyword for dynamic guardrail enrichment. `(keyword, locale)`
 * UNIQUE — required by atomic UPSERT in `TypeOrmArtKeywordRepository.upsert()`
 * / `bulkUpsert()` (`INSERT ... ON CONFLICT (keyword, locale) DO UPDATE`).
 */
@Entity('art_keywords')
@Unique('UQ_art_keywords_keyword_locale', ['keyword', 'locale'])
export class ArtKeyword {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Normalized (lowercase, trimmed). */
  @Column({ type: 'varchar', length: 200 })
  keyword!: string;

  @Column({ type: 'varchar', length: 10 })
  locale!: string;

  /** Offline grouping (e.g. 'movement', 'technique', 'artist'). */
  @Column({ type: 'varchar', length: 50, default: 'general' })
  category!: string;

  @Column({ type: 'int', default: 1 })
  hitCount!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
