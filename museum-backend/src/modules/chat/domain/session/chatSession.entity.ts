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

@Index('IDX_chat_sessions_userId_updatedAt_id', ['user', 'updatedAt', 'id'])
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

  @Column({ type: 'uuid', nullable: true, name: 'current_room' })
  currentRoom?: string | null;

  @Column({ type: 'uuid', nullable: true, name: 'current_artwork_id' })
  currentArtworkId?: string | null;

  @OneToMany(() => ChatMessage, (message) => message.session, {
    cascade: false,
    eager: false,
  })
  messages!: Relation<ChatMessage>[];

  @VersionColumn({ default: 1 })
  version!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true, name: 'purged_at' })
  purgedAt?: Date | null;
}
