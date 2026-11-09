import {
  Check,
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
@Check('CHK_users_tier', `"tier" IN ('free','premium')`)
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

  @Column({ type: 'boolean', default: false, name: 'notify_on_review_moderation' })
  notifyOnReviewModeration!: boolean;

  @Column({
    type: 'text',
    array: true,
    nullable: false,
    default: () => "'{}'",
    name: 'content_preferences',
  })
  contentPreferences!: ContentPreference[];

  @Column({ type: 'varchar', length: 32, nullable: true, name: 'tts_voice' })
  ttsVoice!: string | null;

  @Column({ type: 'boolean', nullable: false, default: true, name: 'default_museum_mode' })
  defaultMuseumMode!: boolean;

  @Column({
    type: 'varchar',
    length: 16,
    nullable: false,
    default: 'beginner',
    name: 'guide_level',
  })
  guideLevel!: 'beginner' | 'intermediate' | 'expert';

  @Column({ type: 'varchar', length: 8, nullable: false, default: 'auto', name: 'data_mode' })
  dataMode!: 'auto' | 'low' | 'normal';

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

  @Column({ type: 'date', nullable: true, name: 'date_of_birth' })
  dateOfBirth?: Date | null;

  @Column({ type: 'boolean', default: false })
  suspended!: boolean;

  @Index('IDX_users_deleted_at', { where: '"deleted_at" IS NOT NULL' })
  @Column({ type: 'timestamp', nullable: true, name: 'deleted_at' })
  deletedAt!: Date | null;

  @Column({ type: 'varchar', length: 16, default: 'free' })
  tier!: UserTier;

  @Column({ type: 'integer', default: 0, name: 'sessions_month_count' })
  sessionsMonthCount!: number;

  @Column({ type: 'date', nullable: true, name: 'sessions_month_start' })
  sessionsMonthStart!: Date | null;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt!: Date;
}
