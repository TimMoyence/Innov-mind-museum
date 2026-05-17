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

import { User } from '@modules/auth/domain/user/user.entity';
import { NotableArtworksSchema } from '@shared/db/jsonb-schemas/user-memory-notable-artworks.schema';
import { jsonbValidator } from '@shared/db/jsonb-validator';

import type { NotableArtwork } from './userMemory.types';
import type { Relation } from 'typeorm';

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
   * Optimistic-lock version. PASSIVE on primary `upsert()` path — TypeORM only
   * auto-increments via `.save()`/`.update()`, NOT via `.insert().orUpdate()`
   * used by `UserMemoryRepository.upsert()`. Use `updatedAt` for cache
   * invalidation on UPSERT path. Kept so future `.save()` paths gain optimistic
   * lock automatically without schema change.
   */
  @VersionColumn()
  version!: number;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt!: Date;
}
