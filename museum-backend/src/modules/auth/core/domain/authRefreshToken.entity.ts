import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { User } from './user.entity';

@Entity({ name: 'auth_refresh_tokens' })
export class AuthRefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => User, { nullable: false, eager: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column({ type: 'uuid', unique: true })
  jti!: string;

  @Column({ type: 'uuid' })
  familyId!: string;

  @Column({ type: 'varchar', length: 128 })
  tokenHash!: string;

  @Column({ type: 'timestamp' })
  issuedAt!: Date;

  @Column({ type: 'timestamp' })
  expiresAt!: Date;

  @Column({ type: 'timestamp', nullable: true })
  rotatedAt?: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  revokedAt?: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  reuseDetectedAt?: Date | null;

  @Column({ type: 'uuid', nullable: true })
  replacedByTokenId?: string | null;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt!: Date;
}

