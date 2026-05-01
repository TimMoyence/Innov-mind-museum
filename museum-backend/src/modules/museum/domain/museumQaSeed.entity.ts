import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** Seeded Q&A entries for museum low-data packs. Mapped to `museum_qa_seed`. */
@Entity({ name: 'museum_qa_seed' })
@Index(['museumId', 'locale'])
export class MuseumQaSeed {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /**
   * Free-form museum/pack identifier. **NOT a foreign key to `museums.id`.**
   *
   * Offline low-data packs ship with stable string identifiers (e.g. `'louvre'`,
   * `'orsay'`) that are independent of the `museums` table primary key. The
   * column is `varchar(64)` deliberately — adding a real FK to `museums.id`
   * (integer) would break the offline pack distribution model.
   *
   * If a future spec changes this design, also remove the JSDoc note in
   * `1775557229138-AddMuseumQaSeed.ts`.
   */
  @Column({ type: 'varchar', length: 64 })
  museumId!: string;

  @Column({ type: 'varchar', length: 8 })
  locale!: string;

  @Column({ type: 'text' })
  question!: string;

  @Column({ type: 'text' })
  answer!: string;

  @Column({ type: 'jsonb', default: {} })
  metadata!: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
