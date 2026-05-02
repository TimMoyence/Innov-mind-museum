import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

import { User } from './user.entity';

import type { Relation } from 'typeorm';

/** Represents a linked social identity (Apple, Google) for a user. Mapped to `social_accounts`. */
@Entity({ name: 'social_accounts' })
@Unique(['provider', 'providerUserId'])
export class SocialAccount {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => User, { nullable: false, eager: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: Relation<User>;

  @Index()
  @Column({ type: 'integer' })
  userId!: number;

  /** Social provider identifier (e.g. `"apple"`, `"google"`). */
  @Column({ type: 'varchar', length: 20 })
  provider!: string;

  /** User ID on the external provider (opaque string). */
  @Column({ type: 'varchar', length: 255 })
  providerUserId!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email?: string | null;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt!: Date;
}
