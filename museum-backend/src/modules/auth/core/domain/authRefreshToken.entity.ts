import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { User } from './user.entity';

/** Represents a stored refresh token for JWT rotation. Mapped to `auth_refresh_tokens`. */
@Entity({ name: 'auth_refresh_tokens' })
export class AuthRefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_refresh_token_user')
  @ManyToOne(() => User, { nullable: false, eager: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  /** Unique JWT ID claim — used to look up the token. */
  @Column({ type: 'uuid', unique: true })
  jti!: string;

  /** Token family ID for rotation-based reuse detection. */
  @Index('idx_refresh_token_family')
  @Column({ type: 'uuid' })
  familyId!: string;

  /** SHA-256 hash of the raw refresh JWT. */
  @Column({ type: 'varchar', length: 128 })
  tokenHash!: string;

  @Column({ type: 'timestamp' })
  issuedAt!: Date;

  @Index('idx_refresh_token_expires')
  @Column({ type: 'timestamp' })
  expiresAt!: Date;

  /** Set when this token is rotated (replaced by a successor). */
  @Column({ type: 'timestamp', nullable: true })
  rotatedAt?: Date | null;

  /** Set when this token is explicitly revoked (logout or reuse detection). */
  @Column({ type: 'timestamp', nullable: true })
  revokedAt?: Date | null;

  /** Set when a replay attack is detected on this token's family. */
  @Column({ type: 'timestamp', nullable: true })
  reuseDetectedAt?: Date | null;

  /** ID of the successor token after rotation. */
  @Column({ type: 'uuid', nullable: true })
  replacedByTokenId?: string | null;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt!: Date;
}
