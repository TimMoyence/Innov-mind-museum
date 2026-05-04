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
    enum: ['visitor', 'moderator', 'museum_manager', 'admin'],
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

  @CreateDateColumn({ type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt!: Date;
}
