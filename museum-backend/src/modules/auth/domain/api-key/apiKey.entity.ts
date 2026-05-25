import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

import { User } from '@modules/auth/domain/user/user.entity';

import type { Relation } from 'typeorm';

@Entity('api_keys')
export class ApiKey {
  @PrimaryGeneratedColumn()
  id!: number;

  /** First 8 chars of key — used for DB lookup. */
  @Column({ length: 8, unique: true })
  prefix!: string;

  /** HMAC-SHA256(full_key, salt). */
  @Column()
  hash!: string;

  @Column({ length: 64 })
  salt!: string;

  @Column({ length: 100 })
  name!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: Relation<User>;

  // I-OPS7 — index the FK column so the ON DELETE CASCADE from `users` uses an
  // index scan instead of a sequential scan when a user row is deleted (R5).
  @Index('IDX_api_keys_user_id')
  @Column({ name: 'user_id' })
  userId!: number;

  @Column({ type: 'integer', nullable: true, name: 'museum_id' })
  museumId?: number | null;

  @Column({ type: 'timestamp', nullable: true, name: 'expires_at' })
  expiresAt!: Date | null;

  @Column({ type: 'timestamp', nullable: true, name: 'last_used_at' })
  lastUsedAt!: Date | null;

  @Column({ default: true, name: 'is_active' })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
