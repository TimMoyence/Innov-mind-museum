import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { User } from '@modules/auth/domain/user/user.entity';

import type { Relation } from 'typeorm';

@Entity({ name: 'auth_refresh_tokens' })
export class AuthRefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_refresh_token_user')
  @ManyToOne(() => User, { nullable: false, eager: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: Relation<User>;

  @Column({ type: 'uuid', unique: true })
  jti!: string;

  @Index('idx_refresh_token_family')
  @Column({ type: 'uuid' })
  familyId!: string;

  @Column({ type: 'varchar', length: 128 })
  tokenHash!: string;

  @Column({ type: 'timestamp' })
  issuedAt!: Date;

  @Index('idx_refresh_token_expires')
  @Column({ type: 'timestamp' })
  expiresAt!: Date;

  @Column({ type: 'timestamp', nullable: true })
  rotatedAt?: Date | null;

  @Column({ type: 'timestamp', name: 'last_rotated_at', nullable: true })
  lastRotatedAt?: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  revokedAt?: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  reuseDetectedAt?: Date | null;

  @Column({ type: 'uuid', nullable: true })
  replacedByTokenId?: string | null;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt!: Date;
}
