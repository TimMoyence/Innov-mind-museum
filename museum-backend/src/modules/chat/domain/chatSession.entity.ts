import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';

import { User } from '@modules/auth/core/domain/user.entity';

import { ChatMessage } from './chatMessage.entity';

import type { VisitContext } from './chat.types';

/** Represents a chat session between a visitor and the assistant. Mapped to `chat_sessions`. */
@Entity({ name: 'chat_sessions' })
export class ChatSession {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => User, { nullable: true, eager: false, onDelete: 'SET NULL' })
  user?: User | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  locale?: string | null;

  @Column({ type: 'boolean', default: false })
  museumMode!: boolean;

  @Column({ type: 'varchar', length: 256, nullable: true })
  title?: string | null;

  @Column({ type: 'varchar', length: 256, nullable: true })
  museumName?: string | null;

  @Column({ type: 'integer', nullable: true, name: 'museum_id' })
  museumId?: number | null;

  @Column({ type: 'jsonb', nullable: true })
  visitContext?: VisitContext | null;

  @OneToMany(() => ChatMessage, (message) => message.session, {
    cascade: false,
    eager: false,
  })
  messages!: ChatMessage[];

  @VersionColumn()
  version!: number;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt!: Date;
}
