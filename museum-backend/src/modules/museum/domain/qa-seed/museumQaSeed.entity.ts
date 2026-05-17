import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import { MuseumQaSeedMetadataSchema } from '@shared/db/jsonb-schemas/museum-qa-seed-metadata.schema';
import { jsonbValidator } from '@shared/db/jsonb-validator';

/** Seeded Q&A entries for museum low-data packs. */
@Entity({ name: 'museum_qa_seed' })
@Index(['museumId', 'locale'])
export class MuseumQaSeed {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /**
   * Free-form pack identifier (e.g. `'louvre'`). **NOT a FK to `museums.id`**:
   * offline packs need stable string ids independent of integer PK. If spec
   * ever changes, also update `1775557229138-AddMuseumQaSeed.ts`.
   */
  @Column({ type: 'varchar', length: 64 })
  museumId!: string;

  @Column({ type: 'varchar', length: 8 })
  locale!: string;

  @Column({ type: 'text' })
  question!: string;

  @Column({ type: 'text' })
  answer!: string;

  @Column({
    type: 'jsonb',
    default: {},
    transformer: jsonbValidator(MuseumQaSeedMetadataSchema, 'museum_qa_seed.metadata'),
  })
  metadata!: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
