import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';

import { User } from '@modules/auth/domain/user/user.entity';
import { ChatMessage } from '@modules/chat/domain/message/chatMessage.entity';

import type { ChatSessionIntent, VisitContext } from '@modules/chat/domain/chat.types';
import type { Relation } from 'typeorm';

// I-OPS7 — keyset-pagination composite for `listSessions`
// (`WHERE userId = :userId ORDER BY updatedAt DESC, id DESC`). Leftmost member
// is the `user` relation property; TypeORM maps it to the same `"userId"` FK
// column the existing mono `IDX_chat_sessions_userId` decorates (R7). The mono
// index is kept (additive, lowest blast — design D7 / spec Q2).
@Index('IDX_chat_sessions_userId_updatedAt_id', ['user', 'updatedAt', 'id'])
// I-OPS7 — partial index supporting the GDPR retention purge cron, which scans
// the un-purged working set: `WHERE purgedAt IS NULL AND updatedAt < NOW() -
// INTERVAL 'N days'` (chat-purge.job.ts:176-177). The partial `WHERE purged_at
// IS NULL` keeps the index small as the table ages and rows get purged (R6).
@Index('IDX_chat_sessions_purged_at_active', ['updatedAt'], { where: '"purged_at" IS NULL' })
@Entity({ name: 'chat_sessions' })
export class ChatSession {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('IDX_chat_sessions_userId')
  @ManyToOne(() => User, { nullable: true, eager: false, onDelete: 'SET NULL' })
  user?: Relation<User> | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  locale?: string | null;

  @Column({ type: 'boolean', default: false })
  museumMode!: boolean;

  @Column({ type: 'varchar', length: 16, default: 'default' })
  intent!: ChatSessionIntent;

  @Column({ type: 'varchar', length: 256, nullable: true })
  title?: string | null;

  @Column({ type: 'varchar', length: 256, nullable: true })
  museumName?: string | null;

  @Column({ type: 'integer', nullable: true, name: 'museum_id' })
  museumId?: number | null;

  @Column({ type: 'jsonb', nullable: true })
  coordinates?: { lat: number; lng: number } | null;

  @Column({ type: 'jsonb', nullable: true })
  visitContext?: VisitContext | null;

  /**
   * W3 intra-musée — UUID of the room the visitor is currently in (cf. cartel
   * deeplink scan, spec R19/R22). Used by the LLM prompt builder to emit a
   * `[CURRENT ARTWORK]` section before `[END OF SYSTEM INSTRUCTIONS]`.
   */
  @Column({ type: 'uuid', nullable: true, name: 'current_room' })
  currentRoom?: string | null;

  /**
   * W3 intra-musée — UUID of the artwork the visitor just scanned. Looked up
   * in `artwork_knowledge` on prompt build to inject the title (sanitised).
   */
  @Column({ type: 'uuid', nullable: true, name: 'current_artwork_id' })
  currentArtworkId?: string | null;

  @OneToMany(() => ChatMessage, (message) => message.session, {
    cascade: false,
    eager: false,
  })
  messages!: Relation<ChatMessage>[];

  @VersionColumn()
  version!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  /**
   * Set by retention cron (GDPR data minimization). `null` = live; once set,
   * purge worker skips the row (idempotent).
   */
  @Column({ type: 'timestamptz', nullable: true, name: 'purged_at' })
  purgedAt?: Date | null;
}
