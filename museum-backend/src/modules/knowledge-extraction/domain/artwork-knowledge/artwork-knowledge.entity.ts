import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'artwork_knowledge' })
@Index('IDX_artwork_knowledge_title_artist_locale', ['title', 'artist', 'locale'], {
  unique: true,
})
@Index('IDX_artwork_knowledge_museum_id', ['museumId'])
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

  /**
   * W3 intra-musée prep (W1.6b deferred) — UUID of the room this artwork
   * lives in inside the museum. Populated by the future SigLIP image-position
   * pipeline (design.md §D5). Nullable since legacy rows + non-pilot museums
   * won't have room mapping in V1.
   */
  @Column({ type: 'uuid', nullable: true, name: 'room_id' })
  roomId?: string | null;

  /**
   * I-SEC8 (OWASP LLM08) — internal tenant axis (`museums.id`), mirror of the
   * C7 precedent on `artwork_embeddings`. `NULL` = global public catalog row
   * (visible to every tenant); `= X` = tenant-X-private row (visible only to a
   * session whose `museumId = X`). 100% of V1 rows are NULL (no B2B tenant
   * writes yet); the column ships before the first B2B onboarding so the
   * read-path scope in `findById` does not require an emergency hot-path
   * refactor the day a tenant goes live. FK `museums(id) ON DELETE SET NULL`.
   */
  @Column({ type: 'integer', nullable: true, name: 'museum_id' })
  museumId?: number | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
