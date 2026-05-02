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

import type { Relation } from 'typeorm';

/**
 * GDPR consent scopes tracked by the platform. Add new values here as new
 * personal-data flows go live; the enum-like union is intentionally open for
 * forward compatibility (we store the scope as a free-form VARCHAR so adding
 * a scope doesn't require a DB migration — only a constant update here).
 */
export const CONSENT_SCOPES = ['location_to_llm', 'analytics', 'marketing'] as const;

/**
 *
 */
export type ConsentScope = (typeof CONSENT_SCOPES)[number];

/**
 * Source that captured the consent, for audit trail. `ui` = tap on a consent
 * screen, `api` = third-party integration, `registration` = onboarding bundle.
 */
export const CONSENT_SOURCES = ['ui', 'api', 'registration'] as const;
/**
 *
 */
export type ConsentSource = (typeof CONSENT_SOURCES)[number];

/**
 * Represents a single grant (or past grant) of a specific consent scope by a
 * user. A row with `revokedAt = null` is the current active consent; setting
 * `revokedAt` marks revocation while preserving the audit record. New grants
 * for the same (user, scope) are inserted as new rows so history is preserved.
 */
@Entity({ name: 'user_consents' })
@Index('IDX_user_consents_user_scope', ['userId', 'scope'])
export class UserConsent {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: Relation<User>;

  @Column({ name: 'user_id' })
  userId!: number;

  /** Scope identifier, e.g. 'location_to_llm'. Free-form VARCHAR for forward compat. */
  @Column({ type: 'varchar', length: 64 })
  scope!: string;

  /** Policy/version at time of grant (e.g. '2026-04-24'). */
  @Column({ type: 'varchar', length: 32 })
  version!: string;

  /** When the user granted consent. */
  @Column({ type: 'timestamp', name: 'granted_at' })
  grantedAt!: Date;

  /** When the user revoked consent, or null while still active. */
  @Column({ type: 'timestamp', name: 'revoked_at', nullable: true })
  revokedAt!: Date | null;

  /** Capture channel (ui / api / registration). */
  @Column({ type: 'varchar', length: 32 })
  source!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
