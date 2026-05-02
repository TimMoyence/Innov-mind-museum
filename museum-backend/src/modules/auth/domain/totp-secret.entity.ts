import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { TotpRecoveryCodesSchema } from '@shared/db/jsonb-schemas/totp-recovery-codes.schema';
import { jsonbValidator } from '@shared/db/jsonb-validator';

import { User } from './user.entity';

import type { Relation } from 'typeorm';

/**
 * Per-user TOTP shared secret + recovery code material (R16, SOC2 CC6.1).
 *
 * The shared secret is encrypted at rest with AES-256-GCM keyed by
 * `MFA_ENCRYPTION_KEY` (distinct from JWT and media signing secrets). The
 * `secretEncrypted` field holds a single base64 string carrying the IV (12 B),
 * auth tag (16 B), and ciphertext concatenated as
 * `base64(iv) + ':' + base64(tag) + ':' + base64(ciphertext)` — see
 * `useCase/totp/totpEncryption.ts`.
 *
 * Recovery codes are stored as bcrypt hashes inside a JSON array. Each entry
 * carries `consumedAt` so a code can be used at most once. We deliberately
 * keep consumed entries so audit reads (`mfa_recovery_used`) can still verify
 * the consumption count without DELETE/INSERT churn.
 */
@Entity({ name: 'totp_secrets' })
export class TotpSecret {
  @PrimaryGeneratedColumn()
  id!: number;

  /**
   * One TotpSecret per user. The unique index on `user_id` enforces 1:1; the
   * absence of a row means MFA has never been enrolled for that user.
   */
  @Index('idx_totp_secrets_user', { unique: true })
  @OneToOne(() => User, { nullable: false, eager: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: Relation<User>;

  @Column({ type: 'integer', name: 'user_id' })
  userId!: number;

  /** AES-256-GCM payload — see {@link totpEncryption.ts} for wire format. */
  @Column({ type: 'varchar', length: 512, name: 'secret_encrypted' })
  secretEncrypted!: string;

  /**
   * Set on the first successful enrollment-verification call. Until set, the
   * row exists but does not gate admin login. A second `enrollMfa` call before
   * verification will rotate the secret (and clear the still-null timestamp).
   */
  @Column({ type: 'timestamptz', nullable: true, name: 'enrolled_at' })
  enrolledAt!: Date | null;

  /** Last `verifyMfa` / `challengeMfa` success. Useful for stale-MFA audits. */
  @Column({ type: 'timestamptz', nullable: true, name: 'last_used_at' })
  lastUsedAt!: Date | null;

  /**
   * Bcrypt-hashed recovery codes. 10 entries on enrollment. Each entry tracks
   * its own consumption timestamp; `null` means the code is still valid.
   * Stored as JSONB to keep migrations and partial-update queries simple.
   */
  @Column({
    type: 'jsonb',
    name: 'recovery_codes',
    default: () => "'[]'::jsonb",
    transformer: jsonbValidator(TotpRecoveryCodesSchema, 'totp_secrets.recovery_codes'),
  })
  recoveryCodes!: TotpRecoveryCode[];

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}

/** Persisted recovery-code entry. `consumedAt` ISO string when redeemed. */
export interface TotpRecoveryCode {
  /** Bcrypt hash (cost >= 10) of the plain code that was shown to the user. */
  hash: string;
  /** ISO-8601 timestamp; `null` while the code remains usable. */
  consumedAt: string | null;
}
