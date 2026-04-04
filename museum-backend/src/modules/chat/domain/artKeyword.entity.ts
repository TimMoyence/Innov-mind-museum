import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** Crowdsourced art keyword used for dynamic guardrail enrichment. */
@Entity('art_keywords')
export class ArtKeyword {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Normalized keyword (lowercase, trimmed). */
  @Column({ type: 'varchar', length: 200 })
  keyword!: string;

  /** Locale code (e.g., 'en', 'fr'). */
  @Column({ type: 'varchar', length: 10 })
  locale!: string;

  /** Semantic category for offline grouping (e.g., 'movement', 'technique', 'artist'). */
  @Column({ type: 'varchar', length: 50, default: 'general' })
  category!: string;

  /** Number of times this keyword was detected in user messages. */
  @Column({ type: 'int', default: 1 })
  hitCount!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
