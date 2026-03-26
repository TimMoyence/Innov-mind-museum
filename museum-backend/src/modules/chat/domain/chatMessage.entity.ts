import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { ArtworkMatch } from './artworkMatch.entity';
import { ChatSession } from './chatSession.entity';

import type { ChatRole } from './chat.types';

/** Represents a single message (user, assistant, or system) within a chat session. Mapped to `chat_messages`. */
@Entity({ name: 'chat_messages' })
export class ChatMessage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => ChatSession, (session) => session.messages, {
    onDelete: 'CASCADE',
  })
  session!: ChatSession;

  @Column({ type: 'varchar', length: 20 })
  role!: ChatRole;

  @Column({ type: 'text', nullable: true })
  text?: string | null;

  @Column({ type: 'text', nullable: true })
  imageRef?: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown> | null;

  @OneToMany(() => ArtworkMatch, (match) => match.message, {
    cascade: false,
    eager: false,
  })
  artworkMatches!: ArtworkMatch[];

  @CreateDateColumn({ type: 'timestamp' })
  createdAt!: Date;
}
