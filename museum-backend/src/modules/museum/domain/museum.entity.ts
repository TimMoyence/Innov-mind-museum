import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';

import type { MuseumCategory } from '@shared/http/overpass.client';

/** Represents a museum tenant in the B2B multi-tenancy model. Mapped to `museums`. */
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

  @Column({ type: 'jsonb', default: '{}' })
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

  /**
   * Optimistic-locking version column. Auto-incremented by TypeORM on every
   * save. Detects concurrent admin edits — see withOptimisticLockRetry helper
   * in src/shared/db/optimistic-lock-retry.ts.
   */
  @VersionColumn()
  version!: number;
}
