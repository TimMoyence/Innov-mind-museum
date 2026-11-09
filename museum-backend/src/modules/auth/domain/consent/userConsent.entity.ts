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

export const CONSENT_SCOPES = [
  'location_to_llm',
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

export const CONSENT_SOURCES = ['ui', 'api', 'registration'] as const;
export type ConsentSource = (typeof CONSENT_SOURCES)[number];

export const isConsentScope = (value: string): value is ConsentScope =>
  (CONSENT_SCOPES as readonly string[]).includes(value);

export const isConsentSource = (value: string): value is ConsentSource =>
  (CONSENT_SOURCES as readonly string[]).includes(value);

@Entity({ name: 'user_consents' })
@Index('IDX_user_consents_user_scope', ['userId', 'scope'])
export class UserConsent {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'FK_user_consents_user' })
  user!: Relation<User>;

  @Column({ name: 'user_id' })
  userId!: number;

  @Column({ type: 'varchar', length: 64 })
  scope!: string;

  @Column({ type: 'varchar', length: 32 })
  version!: string;

  @Column({ type: 'timestamp', name: 'granted_at' })
  grantedAt!: Date;

  @Column({ type: 'timestamp', name: 'revoked_at', nullable: true })
  revokedAt!: Date | null;

  @Column({ type: 'varchar', length: 32 })
  source!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
