import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Museum } from '@modules/museum/domain/museum.entity';

/**
 *
 */
@Entity({ name: 'museum_enrichment' })
@Index('IDX_museum_enrichment_name_locale', ['name', 'locale'], { unique: true })
export class MuseumEnrichment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Museum, { nullable: true, onDelete: 'SET NULL' })
  museum?: Museum | null;

  @Column({ type: 'uuid', nullable: true })
  museumId!: string | null;

  @Column({ type: 'varchar', length: 300 })
  name!: string;

  @Column({ type: 'jsonb', nullable: true })
  openingHours!: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  admissionFees!: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  website!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  collections!: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  currentExhibitions!: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  accessibility!: Record<string, unknown> | null;

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
