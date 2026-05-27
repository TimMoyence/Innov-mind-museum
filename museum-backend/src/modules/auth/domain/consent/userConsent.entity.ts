import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { User } from '@modules/auth/domain/user/user.entity';

import type { Relation } from 'typeorm';

/**
 * GDPR consent scopes. Stored as free-form VARCHAR so adding a scope requires
 * no DB migration.
 *
 * `third_party_ai_<category>_<provider>` (S4-P0-02 — Apple Guideline 5.1.2(i))
 * captures per-category × per-provider consent for AI vendor flow. DeepSeek
 * scopes intentionally omitted — sentinel S4-P0-04 blocks `LLM_PROVIDER=deepseek`
 * in EU prod.
 */
export const CONSENT_SCOPES = [
  'location_to_llm',
  // Coarse geo consent (cycle 1.5): city + country only to the LLM, separate
  // from the full `location_to_llm` (neighbourhood) grant. Free-form VARCHAR →
  // no DB migration.
  'location_coarse_to_llm',
  'analytics',
  'marketing',
  'tos_privacy',
  'third_party_ai_text_openai',
  'third_party_ai_image_openai',
  'third_party_ai_audio_openai',
  'third_party_ai_profile_openai',
  'third_party_ai_text_google',
  'third_party_ai_image_google',
  'third_party_ai_audio_google',
  'third_party_ai_profile_google',
] as const;

export type ConsentScope = (typeof CONSENT_SCOPES)[number];

/** `ui` = consent screen tap, `api` = 3rd-party integration, `registration` = onboarding bundle. */
export const CONSENT_SOURCES = ['ui', 'api', 'registration'] as const;
export type ConsentSource = (typeof CONSENT_SOURCES)[number];

/**
 * Single grant (or past grant) of a scope. `revokedAt=null` = active.
 * New grants for the same (user, scope) insert new rows so history is preserved.
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

  /** Free-form VARCHAR for forward compat. */
  @Column({ type: 'varchar', length: 64 })
  scope!: string;

  /** Policy version at grant time (e.g. '2026-04-24'). */
  @Column({ type: 'varchar', length: 32 })
  version!: string;

  @Column({ type: 'timestamp', name: 'granted_at' })
  grantedAt!: Date;

  @Column({ type: 'timestamp', name: 'revoked_at', nullable: true })
  revokedAt!: Date | null;

  /** Capture channel (ui / api / registration). */
  @Column({ type: 'varchar', length: 32 })
  source!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
