import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';

import { User } from '@modules/auth/domain/user.entity';
import { NotableArtworksSchema } from '@shared/db/jsonb-schemas/user-memory-notable-artworks.schema';
import { jsonbValidator } from '@shared/db/jsonb-validator';

import type { NotableArtwork } from './userMemory.types';
import type { Relation } from 'typeorm';

/** Persists cross-session memory for a user (expertise, favourite artists/periods, etc.). Mapped to `user_memories`. */
@Entity({ name: 'user_memories' })
export class UserMemory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: Relation<User>;

  @Column({ type: 'integer', name: 'user_id', unique: true })
  userId!: number;

  @Column({ type: 'varchar', length: 16, default: 'beginner' })
  preferredExpertise!: string;

  @Column({ type: 'text', array: true, default: '{}' })
  favoritePeriods!: string[];

  @Column({ type: 'text', array: true, default: '{}' })
  favoriteArtists!: string[];

  @Column({ type: 'text', array: true, default: '{}' })
  museumsVisited!: string[];

  @Column({ type: 'integer', default: 0 })
  totalArtworksDiscussed!: number;

  @Column({
    type: 'jsonb',
    default: '[]',
    transformer: jsonbValidator(NotableArtworksSchema, 'user_memories.notableArtworks'),
  })
  notableArtworks!: NotableArtwork[];

  @Column({ type: 'text', array: true, default: '{}' })
  interests!: string[];

  @Column({ type: 'text', nullable: true })
  summary!: string | null;

  @Column({ type: 'boolean', default: false })
  disabledByUser!: boolean;

  @Column({ type: 'integer', default: 0 })
  sessionCount!: number;

  @Column({ type: 'uuid', nullable: true })
  lastSessionId!: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true, name: 'language_preference' })
  languagePreference!: string | null;

  @Column({ type: 'integer', nullable: true, name: 'session_duration_p90_minutes' })
  sessionDurationP90Minutes!: number | null;

  /**
   * Optimistic-lock version. Currently passive on the primary `upsert()` path —
   * TypeORM only auto-increments `@VersionColumn` via `.save()` / `.update()`,
   * not via the query-builder `.insert().orUpdate()` used by `UserMemoryRepository.upsert()`.
   * Kept for two reasons:
   *
   * 1. **Defensive guard**: any future code path that switches to `.save()` will
   *    gain optimistic-lock protection automatically without a schema change.
   * 2. **Passive counter**: the column is seeded at `1` on first insert (via any
   *    `.save()` path). Use `updatedAt` for cache invalidation on the UPSERT path
   *    since `version` does not increment there.
   */
  @VersionColumn()
  version!: number;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt!: Date;
}
