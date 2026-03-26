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

import { User } from '@modules/auth/core/domain/user.entity';

import type { NotableArtwork } from './userMemory.types';

/** Persists cross-session memory for a user (expertise, favourite artists/periods, etc.). Mapped to `user_memories`. */
@Entity({ name: 'user_memories' })
export class UserMemory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

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

  @Column({ type: 'jsonb', default: '[]' })
  notableArtworks!: NotableArtwork[];

  @Column({ type: 'text', array: true, default: '{}' })
  interests!: string[];

  @Column({ type: 'text', nullable: true })
  summary!: string | null;

  @Column({ type: 'integer', default: 0 })
  sessionCount!: number;

  @Column({ type: 'uuid', nullable: true })
  lastSessionId!: string | null;

  @VersionColumn()
  version!: number;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt!: Date;
}
