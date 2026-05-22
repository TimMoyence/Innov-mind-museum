import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';

import { MuseumConfigSchema } from '@shared/db/jsonb-schemas/museum-config.schema';
import { jsonbValidator } from '@shared/db/jsonb-validator';

import type { MuseumCategory } from '@shared/http/overpass.client';

/** B2B multi-tenancy tenant. */
@Entity({ name: 'museums' })
export class Museum {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 256 })
  name!: string;

  @Column({ type: 'varchar', length: 128, unique: true })
  slug!: string;

  /**
   * Wikidata Q-identifier (e.g. `Q3329534` for Musée d'Aquitaine). Pins the
   * museum to its canonical Wikidata entity, which acts as the lookup key for
   * the SPARQL ingest pipeline (`catalog-ingest.ts --museum=<Qid>` resolves
   * the tenant `museum_id` via this column) and surfaces public metadata
   * (linked-data references, multilingual labels) to FE callers.
   *
   * Nullable so existing rows do not require a hand-curated Q-code at the
   * migration window — operators set it via the seed (T-A9) or admin UI.
   * UNIQUE so a single Wikidata entity maps to at most one tenant row.
   *
   * Spec: design.md §4 M1, T-A7 (Wave A C3).
   */
  @Column({ type: 'varchar', length: 16, nullable: true, unique: true, name: 'wikidata_qid' })
  wikidataQid?: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  address?: string | null;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({
    type: 'jsonb',
    default: '{}',
    transformer: jsonbValidator(MuseumConfigSchema, 'museums.config'),
  })
  config!: Record<string, unknown>;

  @Column({ type: 'varchar', length: 32, default: 'general' })
  museumType!: MuseumCategory;

  @Column({ type: 'double precision', nullable: true })
  latitude?: number | null;

  @Column({ type: 'double precision', nullable: true })
  longitude?: number | null;

  @Column({ type: 'boolean', default: true, name: 'is_active' })
  isActive!: boolean;

  /**
   * W3 geofence-containment storage. The actual DB shape depends on
   * `AddMuseumGeofence` migration mode :
   *   - PostGIS path → `geofence geometry(Polygon, 4326)` column.
   *   - JSONB path   → `geofence_bbox jsonb` column.
   *
   * Both columns are mutually exclusive at the DB layer (the migration
   * creates only one depending on PostGIS availability). The PostGIS
   * `geofence` column is NOT declared here — TypeORM treats unknown
   * columns as drift, and the geometry type isn't first-class in
   * the ORM. `MuseumRepositoryPg.findByCoords` reads `geofence` via
   * raw `dataSource.query(ST_Contains...)` when that mode is active.
   *
   * `geofenceBbox` is declared as a real column (with `select: false`)
   * so it doesn't load on default `findOne()` paths, but the migration
   * shape matches when the JSONB-bbox mode is active.
   */
  @Column({ type: 'jsonb', nullable: true, name: 'geofence_bbox', select: false })
  geofenceBbox?: { north: number; south: number; east: number; west: number } | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;

  /** Detects concurrent admin edits — see withOptimisticLockRetry helper. */
  @VersionColumn()
  version!: number;
}
