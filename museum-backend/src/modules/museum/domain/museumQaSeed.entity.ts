import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** Seeded Q&A entries for museum low-data packs. Mapped to `museum_qa_seed`. */
@Entity({ name: 'museum_qa_seed' })
@Index(['museumId', 'locale'])
export class MuseumQaSeed {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

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
