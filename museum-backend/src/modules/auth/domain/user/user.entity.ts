// src/modules/auth/domain/user.entity.ts
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

/** Represents a registered user account. Mapped to `users`. */
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

  /** Bcrypt-hashed password. `null` for social-only accounts. */
  @Column({ type: 'varchar', nullable: true })
  password!: string | null;

  @Column({ nullable: true })
  firstname?: string;

  @Column({ nullable: true })
  lastname?: string;

  /** One-time token for password reset flow. */
  @Index('IDX_users_reset_token', { where: '"reset_token" IS NOT NULL' })
  @Column({ nullable: true })
  reset_token?: string;

  /** Expiration timestamp for {@link reset_token}. */
  @Column({ nullable: true, type: 'timestamp' })
  reset_token_expires: Date;

  @Column({ type: 'boolean', default: false })
  email_verified!: boolean;

  @Column({ type: 'boolean', default: false })
  onboarding_completed!: boolean;

  /**
   * Opt-in flag for receiving an email when a moderator approves or rejects
   * one of the user's reviews. Default `false` to respect GDPR Art. 6(1)(a)
   * consent — the user must explicitly opt-in via profile settings.
   */
  @Column({ type: 'boolean', default: false, name: 'notify_on_review_moderation' })
  notifyOnReviewModeration!: boolean;

  /**
   * Visitor's preferred aspects to learn about an artwork (zero or more of
   * 'history', 'technique', 'artist'). Used by the LLM to emphasize relevant
   * angles when naturally appropriate. Empty array means "no preference".
   */
  @Column({
    type: 'text',
    array: true,
    nullable: false,
    default: () => "'{}'",
    name: 'content_preferences',
  })
  contentPreferences!: ContentPreference[];

  /**
   * Visitor's preferred TTS voice (one of {@link TTS_VOICES}). `null` means
   * "use the env-level default" (`env.tts.voice`). Validated server-side
   * against the catalog before persistence.
   */
  @Column({ type: 'varchar', length: 32, nullable: true, name: 'tts_voice' })
  ttsVoice!: string | null;

  /**
   * TD-2 — Visitor's preferred default locale (BCP-47). Validated FE-side
   * against `SUPPORTED_LOCALES`. BE accepts any 2-8 char string for
   * forward-compat (new locales don't require migration).
   */
  @Column({ type: 'varchar', length: 8, nullable: false, default: 'en-US', name: 'default_locale' })
  defaultLocale!: string;

  /**
   * TD-2 — Whether the visitor opts into "museum mode" by default (auto-detect
   * proximity to museums + suggest in-museum walks).
   */
  @Column({ type: 'boolean', nullable: false, default: true, name: 'default_museum_mode' })
  defaultMuseumMode!: boolean;

  /**
   * TD-2 — Visitor's self-declared expertise level. Used to tune LLM
   * vocabulary + depth. Zod-enum validated at the route boundary.
   */
  @Column({
    type: 'varchar',
    length: 16,
    nullable: false,
    default: 'beginner',
    name: 'guide_level',
  })
  guideLevel!: 'beginner' | 'intermediate' | 'expert';

  /**
   * TD-2 — Visitor's data-mode preference (auto/low/normal). Drives the FE
   * data-saver heuristic (image quality, prefetch). Zod-enum validated.
   */
  @Column({ type: 'varchar', length: 8, nullable: false, default: 'auto', name: 'data_mode' })
  dataMode!: 'auto' | 'low' | 'normal';

  /**
   * TD-2 — Visitor's audio-description accessibility flag. Migrated from a
   * FE-only AsyncStorage hook to a Zustand store + server-persisted column
   * so the preference survives reinstall + propagates across devices.
   */
  @Column({ type: 'boolean', nullable: false, default: false, name: 'audio_description_mode' })
  audioDescriptionMode!: boolean;

  @Column({ nullable: true })
  verification_token?: string;

  @Column({ nullable: true, type: 'timestamp' })
  verification_token_expires?: Date;

  /** New email address pending verification via email change flow. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  pending_email?: string | null;

  /** Hashed token for confirming an email change. */
  @Index('IDX_users_email_change_token', { where: '"email_change_token" IS NOT NULL' })
  @Column({ type: 'varchar', length: 128, nullable: true })
  email_change_token?: string | null;

  /** Expiration timestamp for {@link email_change_token}. */
  @Column({ nullable: true, type: 'timestamp' })
  email_change_token_expiry?: Date | null;

  /**
   * Soft enrollment deadline for the MFA warning policy (R16, SOC2 CC6.1).
   *
   * Set to `now + MFA_ENROLLMENT_WARNING_DAYS` the first time an admin without
   * MFA logs in after the feature ships. Inside the window the user keeps
   * full session privileges; the login response carries a banner driver
   * (`mfaWarningDaysRemaining`) for the UI. Past the deadline the login flow
   * stops issuing JWTs and surfaces `mfaEnrollmentRequired = true`, forcing
   * enrollment before any further admin action. Cleared (`null`) once the
   * user successfully enrols.
   *
   * Always nullable: visitor-role users never get a deadline.
   */
  @Column({ type: 'timestamptz', nullable: true, name: 'mfa_enrollment_deadline' })
  mfaEnrollmentDeadline?: Date | null;

  /**
   * Visitor's date of birth, captured at registration to enforce the French
   * "majorité numérique" (15 years — CNIL Délibération 2021-018). Nullable
   * because legacy accounts created before the age-gate landed had no DOB
   * collected; new registrations always set it.
   */
  @Column({ type: 'date', nullable: true, name: 'date_of_birth' })
  dateOfBirth?: Date | null;

  /**
   * Operator-driven account freeze flag (P0 #9 admin user detail).
   * `true` blocks login + refresh; existing 15-min access tokens expire
   * naturally (ADR-052). Reversible via `unsuspendUser` admin action.
   */
  @Column({ type: 'boolean', default: false })
  suspended!: boolean;

  /**
   * Soft-delete marker. When set, the account is treated as deleted across
   * auth (login + refresh refuse) and admin list filtering, but the row
   * stays for foreign-key integrity (chat_messages, audit_log) and forensic
   * forensics. Hard erasure (RGPD Art. 17 full erase) deferred V1.1.
   */
  @Column({ type: 'timestamp', nullable: true, name: 'deleted_at' })
  deletedAt!: Date | null;

  /**
   * Soft-paywall tier (R1 / C6). `'free'` users are subject to the monthly
   * session quota enforced by `monthlySessionQuota` middleware on
   * `POST /api/sessions`. `'premium'` users bypass the quota. Flipped via
   * `PATCH /api/admin/users/:id/tier` (super_admin only). NOT linked to
   * Stripe in V1 — the column itself is the canonical grant signal until
   * the funnel data unblocks Stripe (R1 §0.1).
   */
  @Column({ type: 'varchar', length: 16, default: 'free' })
  tier!: UserTier;

  /**
   * Monthly session-creation counter for the soft-paywall (R1 / C6). Bumped
   * by an atomic UPDATE in `monthlySessionQuota` middleware on each
   * `POST /api/sessions` for a `tier='free'` user. Reset to 1 (not 0) on the
   * first session of a new UTC month (R6 — same SQL increments & resets).
   * Never touched on tier flip (R17). Premium ignores this counter entirely.
   */
  @Column({ type: 'integer', default: 0, name: 'sessions_month_count' })
  sessionsMonthCount!: number;

  /**
   * First-day-of-current-UTC-month sentinel for the monthly quota window
   * (R1 / C6). Nullable for users created before R1 shipped — the first
   * post-deploy session-create initialises it. UTC-only per N5 (no per-user
   * timezone adjustment in V1, see Q2).
   */
  @Column({ type: 'date', nullable: true, name: 'sessions_month_start' })
  sessionsMonthStart!: Date | null;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt!: Date;
}
