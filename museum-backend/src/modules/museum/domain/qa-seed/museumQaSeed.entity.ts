import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import { MuseumQaSeedMetadataSchema } from '@shared/db/jsonb-schemas/museum-qa-seed-metadata.schema';
import { jsonbValidator } from '@shared/db/jsonb-validator';

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

  @Column({
    type: 'jsonb',
    default: {},
    transformer: jsonbValidator(MuseumQaSeedMetadataSchema, 'museum_qa_seed.metadata'),
  })
  metadata!: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
