import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 *
 */
@Entity({ name: 'artwork_knowledge' })
@Index('IDX_artwork_knowledge_title_artist_locale', ['title', 'artist', 'locale'], {
  unique: true,
})
export class ArtworkKnowledge {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 500 })
  title!: string;

  @Column({ type: 'varchar', length: 300, nullable: true })
  artist!: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  period!: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  technique!: string | null;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'text', nullable: true })
  historicalContext!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  dimensions!: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  currentLocation!: string | null;

  @Column({ type: 'jsonb', default: [] })
  sourceUrls!: string[];

  @Column({ type: 'float' })
  confidence!: number;

  @Column({ type: 'boolean', default: false })
  needsReview!: boolean;

  @Column({ type: 'varchar', length: 10 })
  locale!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
