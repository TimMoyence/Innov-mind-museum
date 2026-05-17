import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import type { UserRole } from './user-role';
import type { UserTier } from './user-tier';
import type { ContentPreference } from '@modules/auth/domain/consent/content-preference';

@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true })
  email!: string;

  @Column({
    type: 'enum',
    enum: ['visitor', 'moderator', 'museum_manager', 'admin', 'super_admin'],
    default: 'visitor',
  })
  role!: UserRole;

  @Column({ type: 'integer', nullable: true, name: 'museum_id' })
  museumId?: number | null;

  /** Bcrypt-hashed. `null` for social-only accounts. */
  @Column({ type: 'varchar', nullable: true })
  password!: string | null;

  @Column({ nullable: true })
  firstname?: string;

  @Column({ nullable: true })
  lastname?: string;

  @Index('IDX_users_reset_token', { where: '"reset_token" IS NOT NULL' })
  @Column({ nullable: true })
  reset_token?: string;

  @Column({ nullable: true, type: 'timestamp' })
  reset_token_expires: Date;

  @Column({ type: 'boolean', default: false })
  email_verified!: boolean;

  @Column({ type: 'boolean', default: false })
  onboarding_completed!: boolean;

  /** GDPR Art. 6(1)(a) — default `false`, must explicitly opt-in via profile settings. */
  @Column({ type: 'boolean', default: false, name: 'notify_on_review_moderation' })
  notifyOnReviewModeration!: boolean;

  /** Empty array means "no preference". */
  @Column({
    type: 'text',
    array: true,
    nullable: false,
    default: () => "'{}'",
    name: 'content_preferences',
  })
  contentPreferences!: ContentPreference[];

  /** `null` = use env-level default (`env.tts.voice`). Validated against catalog. */
  @Column({ type: 'varchar', length: 32, nullable: true, name: 'tts_voice' })
  ttsVoice!: string | null;

  /** TD-2 — BCP-47. BE accepts 2-8 chars for forward-compat (new locales don't require migration). */
  @Column({ type: 'varchar', length: 8, nullable: false, default: 'en-US', name: 'default_locale' })
  defaultLocale!: string;

  /** TD-2 */
  @Column({ type: 'boolean', nullable: false, default: true, name: 'default_museum_mode' })
  defaultMuseumMode!: boolean;

  /** TD-2 — Zod-enum validated at route boundary. */
  @Column({
    type: 'varchar',
    length: 16,
    nullable: false,
    default: 'beginner',
    name: 'guide_level',
  })
  guideLevel!: 'beginner' | 'intermediate' | 'expert';

  /** TD-2 — Zod-enum validated. */
  @Column({ type: 'varchar', length: 8, nullable: false, default: 'auto', name: 'data_mode' })
  dataMode!: 'auto' | 'low' | 'normal';

  /** TD-2 — server-persisted so preference survives reinstall + propagates across devices. */
  @Column({ type: 'boolean', nullable: false, default: false, name: 'audio_description_mode' })
  audioDescriptionMode!: boolean;

  @Column({ nullable: true })
  verification_token?: string;

  @Column({ nullable: true, type: 'timestamp' })
  verification_token_expires?: Date;

  @Column({ type: 'varchar', length: 255, nullable: true })
  pending_email?: string | null;

  @Index('IDX_users_email_change_token', { where: '"email_change_token" IS NOT NULL' })
  @Column({ type: 'varchar', length: 128, nullable: true })
  email_change_token?: string | null;

  @Column({ nullable: true, type: 'timestamp' })
  email_change_token_expiry?: Date | null;

  /**
   * MFA warning policy (R16, SOC2 CC6.1). Set to `now + MFA_ENROLLMENT_WARNING_DAYS`
   * on first admin login post-deploy. Inside window: banner via `mfaWarningDaysRemaining`.
   * Past deadline: login stops issuing JWTs, surfaces `mfaEnrollmentRequired=true`.
   * Cleared (`null`) on successful enrol. Always nullable: visitors never get a deadline.
   */
  @Column({ type: 'timestamptz', nullable: true, name: 'mfa_enrollment_deadline' })
  mfaEnrollmentDeadline?: Date | null;

  /**
   * "Majorité numérique" 15y (CNIL Délibération 2021-018). Nullable for legacy
   * accounts created before the age-gate; new registrations always set it.
   */
  @Column({ type: 'date', nullable: true, name: 'date_of_birth' })
  dateOfBirth?: Date | null;

  /** ADR-052 — blocks login + refresh; existing 15-min access tokens expire naturally. */
  @Column({ type: 'boolean', default: false })
  suspended!: boolean;

  /**
   * Soft-delete. Auth refuses login + refresh; row stays for FK integrity
   * (chat_messages, audit_log) + forensics. RGPD Art. 17 hard erase deferred V1.1.
   */
  @Column({ type: 'timestamp', nullable: true, name: 'deleted_at' })
  deletedAt!: Date | null;

  /**
   * R1/C6 soft-paywall. `'free'` subject to monthly session quota (POST /api/sessions),
   * `'premium'` bypasses. NOT linked to Stripe in V1 — this column is the canonical
   * grant signal until funnel data unblocks Stripe (R1 §0.1).
   */
  @Column({ type: 'varchar', length: 16, default: 'free' })
  tier!: UserTier;

  /**
   * R1/C6 monthly counter. Atomic UPDATE in `monthlySessionQuota` middleware.
   * Reset to 1 (not 0) on first session of a new UTC month (R6 — same SQL).
   * Never touched on tier flip (R17). Premium ignores entirely.
   */
  @Column({ type: 'integer', default: 0, name: 'sessions_month_count' })
  sessionsMonthCount!: number;

  /**
   * R1/C6 — first-day-of-current-UTC-month sentinel. Nullable for users created
   * before R1 (first post-deploy session-create initialises). UTC-only per N5.
   */
  @Column({ type: 'date', nullable: true, name: 'sessions_month_start' })
  sessionsMonthStart!: Date | null;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt!: Date;
}
