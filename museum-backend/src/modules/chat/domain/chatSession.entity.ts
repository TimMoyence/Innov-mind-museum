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

import { ChatMessage } from './chatMessage.entity';

import type { ChatSessionIntent, VisitContext } from './chat.types';
import type { Relation } from 'typeorm';

/** Represents a chat session between a visitor and the assistant. Mapped to `chat_sessions`. */
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
   * Timestamp at which session messages were purged by the retention cron
   * (GDPR data minimization). `null` means the session is live; once set the
   * purge worker skips the row on subsequent ticks (idempotent).
   */
  @Column({ type: 'timestamptz', nullable: true, name: 'purged_at' })
  purgedAt?: Date | null;
}
