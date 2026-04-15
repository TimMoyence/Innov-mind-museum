// src/modules/auth/domain/user.entity.ts
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import type { ContentPreference } from './content-preference';
import type { UserRole } from './user-role';

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

  @Column({ nullable: true })
  verification_token?: string;

  @Column({ nullable: true, type: 'timestamp' })
  verification_token_expires?: Date;

  /** New email address pending verification via email change flow. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  pending_email?: string | null;

  /** Hashed token for confirming an email change. */
  @Column({ type: 'varchar', length: 128, nullable: true })
  email_change_token?: string | null;

  /** Expiration timestamp for {@link email_change_token}. */
  @Column({ nullable: true, type: 'timestamp' })
  email_change_token_expiry?: Date | null;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt!: Date;
}
