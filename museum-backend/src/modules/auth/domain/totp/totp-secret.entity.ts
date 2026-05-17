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

import { User } from '@modules/auth/domain/user/user.entity';
import { TotpRecoveryCodesSchema } from '@shared/db/jsonb-schemas/totp-recovery-codes.schema';
import { jsonbValidator } from '@shared/db/jsonb-validator';

import type { Relation } from 'typeorm';

/**
 * Per-user TOTP shared secret + recovery code material (R16, SOC2 CC6.1).
 *
 * Shared secret encrypted at rest with AES-256-GCM keyed by `MFA_ENCRYPTION_KEY`
 * (distinct from JWT and media signing secrets). `secretEncrypted` carries
 * `base64(iv):base64(tag):base64(ciphertext)` — see `useCase/totp/totpEncryption.ts`.
 *
 * Recovery codes stored as bcrypt hashes in a JSON array. Each entry carries
 * `consumedAt` so a code is used at most once. Consumed entries are kept so
 * audit reads (`mfa_recovery_used`) can verify consumption count without
 * DELETE/INSERT churn.
 */
@Entity({ name: 'totp_secrets' })
export class TotpSecret {
  @PrimaryGeneratedColumn()
  id!: number;

  /** Unique on `user_id` enforces 1:1. Absence of row = MFA never enrolled. */
  @Index('idx_totp_secrets_user', { unique: true })
  @OneToOne(() => User, { nullable: false, eager: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: Relation<User>;

  @Column({ type: 'integer', name: 'user_id' })
  userId!: number;

  /** Wire format: see {@link totpEncryption.ts}. */
  @Column({ type: 'varchar', length: 512, name: 'secret_encrypted' })
  secretEncrypted!: string;

  /**
   * Set on first successful enrollment-verification. Until set, the row exists
   * but does not gate admin login. A second `enrollMfa` before verification
   * rotates the secret (clears the still-null timestamp).
   */
  @Column({ type: 'timestamptz', nullable: true, name: 'enrolled_at' })
  enrolledAt!: Date | null;

  /** Last `verifyMfa` / `challengeMfa` success — stale-MFA audits. */
  @Column({ type: 'timestamptz', nullable: true, name: 'last_used_at' })
  lastUsedAt!: Date | null;

  /** 10 entries on enrollment. `consumedAt=null` = still valid. */
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

export interface TotpRecoveryCode {
  /** Bcrypt hash (cost ≥10) of the plain code shown to the user. */
  hash: string;
  /** ISO-8601; `null` while code remains usable. */
  consumedAt: string | null;
}
