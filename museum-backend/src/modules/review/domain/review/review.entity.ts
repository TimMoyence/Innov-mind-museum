import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ForeignKey,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

import { ChatSession } from '@modules/chat/domain/session/chatSession.entity';
import { Museum } from '@modules/museum/domain/museum/museum.entity';

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

  @Index('IDX_reviews_museum_id', { where: '"museum_id" IS NOT NULL' })
  @ForeignKey(() => Museum, { name: 'FK_reviews_museum_id', onDelete: 'SET NULL' })
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
