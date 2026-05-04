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

/**
 * Museum enrichment — aggregated public data (OSM / Wikidata / Wikipedia) keyed
 * by `(name, locale)`. Also used as persistent cache for the P3 hybrid
 * per-locale enrichment endpoint (fields: summary, wikidataQid, phone,
 * imageUrl, fetchedAt).
 */
@Entity({ name: 'museum_enrichment' })
@Index('IDX_museum_enrichment_name_locale', ['name', 'locale'], { unique: true })
export class MuseumEnrichment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Museum, { nullable: true, onDelete: 'SET NULL' })
  museum?: Relation<Museum> | null;

  /**
   * Integer FK to museums.id. Historically typed as `string | null` in the TS
   * entity while the DB column has always been `integer` (see migration
   * 1775852800000-CreateKnowledgeExtractionTables). Corrected to match SQL.
   */
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

  // ── P3 hybrid enrichment fields ────────────────────────────────

  /** Short summary (Wikipedia REST `/page/summary` extract or Wikidata description). */
  @Column({ type: 'text', nullable: true })
  summary!: string | null;

  /** Wikidata QID (e.g. `Q19675`) — empty when lookup failed. */
  @Column({ type: 'varchar', length: 32, nullable: true })
  wikidataQid!: string | null;

  /** Primary phone (Wikidata P1329). Stored raw, not normalised. */
  @Column({ type: 'varchar', length: 32, nullable: true })
  phone!: string | null;

  /** Commons image URL (Wikidata P18). */
  @Column({ type: 'varchar', length: 500, nullable: true })
  imageUrl!: string | null;

  /**
   * Last successful enrichment fetch (UTC). Used as TTL anchor by
   * `EnrichMuseumUseCase` (30-day freshness window).
   */
  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  fetchedAt!: Date;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
