import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity({ name: 'reviews' })
export class Review {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'integer' })
  userId!: number;

  @Column({ type: 'varchar', length: 128 })
  userName!: string;

  @Column({ type: 'smallint' })
  rating!: number;

  @Column({ type: 'text' })
  comment!: string;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status!: string;

  /**
   * B2B multi-tenant scope (Wave B C7 / R-C7a). FK → `museums.id` (integer PK,
   * cf. `museum.entity.ts:18-19` — NOT UUID). Nullable so existing reviews
   * (pre-multi-tenant) survive the migration without backfill. Partial index
   * excludes NULLs to keep the index small while existing rows are migrated.
   *
   * Spec: design.md §4 M2, T-B7.
   */
  @Index('IDX_reviews_museum_id', { where: '"museum_id" IS NOT NULL' })
  @Column({ type: 'integer', nullable: true, name: 'museum_id' })
  museumId?: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
