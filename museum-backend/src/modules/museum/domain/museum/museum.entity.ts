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

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;

  /** Detects concurrent admin edits — see withOptimisticLockRetry helper. */
  @VersionColumn()
  version!: number;
}
