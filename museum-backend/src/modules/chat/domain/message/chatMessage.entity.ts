import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { ArtworkMatch } from '@modules/chat/domain/art-keyword/artworkMatch.entity';
import { ChatSession } from '@modules/chat/domain/session/chatSession.entity';
import { ChatMessageMetadataSchema } from '@shared/db/jsonb-schemas/chat-message-metadata.schema';
import { jsonbValidator } from '@shared/db/jsonb-validator';

import type { ChatRole } from '@modules/chat/domain/chat.types';
import type { Relation } from 'typeorm';

@Entity({ name: 'chat_messages' })
export class ChatMessage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => ChatSession, (session) => session.messages, {
    onDelete: 'CASCADE',
  })
  session!: Relation<ChatSession>;

  @Index('IDX_chat_messages_sessionId')
  @Column({ type: 'uuid' })
  sessionId!: string;

  @Column({ type: 'varchar', length: 20 })
  role!: ChatRole;

  @Column({ type: 'text', nullable: true })
  text?: string | null;

  @Column({ type: 'text', nullable: true })
  imageRef?: string | null;

  @Column({
    type: 'jsonb',
    nullable: true,
    transformer: jsonbValidator(ChatMessageMetadataSchema, 'chat_messages.metadata'),
  })
  metadata?: Record<string, unknown> | null;

  /** Assistant only. Format: `s3://<key>` or `local-audio://<filename>`. */
  @Column({ type: 'text', nullable: true })
  audioUrl?: string | null;

  /** Used to invalidate stale cache entries. */
  @Column({ type: 'timestamptz', nullable: true })
  audioGeneratedAt?: Date | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  audioVoice?: string | null;

  /**
   * PR-P0-1 (2026-05-23) — opaque LLM-cache-invalidation cookie.
   *
   * The exact Redis key (`llm:v2:{contextClass}:{museumId|none}:{userId|anon}:{sha256}`)
   * used by `LlmCacheServiceImpl` when this assistant response was cached.
   * Read at feedback time by `ChatMediaService.invalidateCacheForFeedback`
   * to purge the exact entry (replaces the broken `chat:llm:*` cartesian
   * that targeted 0 real keys — closes the I-FIX1 sweep from 2026-05-21).
   *
   * Null when:
   *   - the response was not cached (image-only path, no llmCache configured,
   *     image present but no visual signature, etc.)
   *   - the row was written BEFORE this column existed (legacy rows — TTL
   *     out within ≤ 7 days, R4 skip-when-null contract handles them)
   *
   * Internal-only (NFR-2) — never exposed via API response shapes.
   */
  @Column({ type: 'text', nullable: true, name: 'cache_key' })
  cacheKey?: string | null;

  @OneToMany(() => ArtworkMatch, (match) => match.message, {
    cascade: false,
    eager: false,
  })
  artworkMatches!: Relation<ArtworkMatch>[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
