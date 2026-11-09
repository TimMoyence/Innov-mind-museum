import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Museum } from '@modules/museum/domain/museum/museum.entity';
import {
  AccessibilitySchema,
  AdmissionFeesSchema,
  CollectionsSchema,
  CurrentExhibitionsSchema,
  OpeningHoursSchema,
  SourceUrlsSchema,
} from '@shared/db/jsonb-schemas/museum-enrichment.schemas';
import { jsonbValidator } from '@shared/db/jsonb-validator';

import type { Relation } from 'typeorm';

@Entity({ name: 'museum_enrichment' })
@Index('IDX_museum_enrichment_name_locale', ['name', 'locale'], { unique: true })
export class MuseumEnrichment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Museum, { nullable: true, onDelete: 'SET NULL' })
  museum?: Relation<Museum> | null;

  @Index('IDX_museum_enrichment_museumId')
  @Column({ type: 'int', nullable: true })
  museumId!: number | null;

  @Column({ type: 'varchar', length: 300 })
  name!: string;

  @Column({
    type: 'jsonb',
    nullable: true,
    transformer: jsonbValidator(OpeningHoursSchema, 'museum_enrichment.openingHours'),
  })
  openingHours!: Record<string, unknown> | null;

  @Column({
    type: 'jsonb',
    nullable: true,
    transformer: jsonbValidator(AdmissionFeesSchema, 'museum_enrichment.admissionFees'),
  })
  admissionFees!: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  website!: string | null;

  @Column({
    type: 'jsonb',
    nullable: true,
    transformer: jsonbValidator(CollectionsSchema, 'museum_enrichment.collections'),
  })
  collections!: Record<string, unknown> | null;

  @Column({
    type: 'jsonb',
    nullable: true,
    transformer: jsonbValidator(CurrentExhibitionsSchema, 'museum_enrichment.currentExhibitions'),
  })
  currentExhibitions!: Record<string, unknown> | null;

  @Column({
    type: 'jsonb',
    nullable: true,
    transformer: jsonbValidator(AccessibilitySchema, 'museum_enrichment.accessibility'),
  })
  accessibility!: Record<string, unknown> | null;

  @Column({
    type: 'jsonb',
    default: [],
    transformer: jsonbValidator(SourceUrlsSchema, 'museum_enrichment.sourceUrls'),
  })
  sourceUrls!: string[];

  @Column({ type: 'float' })
  confidence!: number;

  @Column({ type: 'boolean', default: false })
  needsReview!: boolean;

  @Column({ type: 'varchar', length: 10 })
  locale!: string;

  @Column({ type: 'text', nullable: true })
  summary!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  wikidataQid!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  phone!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  imageUrl!: string | null;

  @Index('IDX_museum_enrichment_fetchedAt')
  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  fetchedAt!: Date;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
