import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

import { ChatSession } from '@modules/chat/domain/session/chatSession.entity';

import type { Relation } from 'typeorm';

@Entity({ name: 'reviews' })
export class Review {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'integer' })
  userId!: number;

  @Column({ type: 'varchar', length: 128 })
  userName!: string;

  @Column({ type: 'smallint' })
  rating!: number;

  @Column({ type: 'text' })
  comment!: string;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status!: string;

  /**
   * B2B multi-tenant scope (Wave B C7 / R-C7a). FK → `museums.id` (integer PK,
   * cf. `museum.entity.ts:18-19` — NOT UUID). Nullable so existing reviews
   * (pre-multi-tenant) survive the migration without backfill. Partial index
   * excludes NULLs to keep the index small while existing rows are migrated.
   *
   * Spec: design.md §4 M2, T-B7.
   */
  @Index('IDX_reviews_museum_id', { where: '"museum_id" IS NOT NULL' })
  @Column({ type: 'integer', nullable: true, name: 'museum_id' })
  museumId?: number | null;

  /**
   * NPS attribution link (C2 / R5 / Q3). UUID of the chat session the review
   * was authored from — drives `museum_id` at POST time
   * (`createReview.useCase.ts`). FK → `chat_sessions.id` (uuid PK) with
   * `ON DELETE SET NULL` so a purged session nulls the link without corrupting
   * the already-attributed `museum_id` (GDPR retention coupling). Nullable: no
   * backfill of existing reviews. Partial index excludes NULLs to stay small.
   */
  @Index('IDX_reviews_session_id', { where: '"session_id" IS NOT NULL' })
  @Column({ type: 'uuid', nullable: true, name: 'session_id' })
  sessionId?: string | null;

  @ManyToOne(() => ChatSession, { nullable: true, eager: false, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'session_id' })
  session?: Relation<ChatSession> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
