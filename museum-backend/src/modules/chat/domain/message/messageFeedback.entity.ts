import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

import { ChatMessage } from './chatMessage.entity';

import type { Relation } from 'typeorm';

export type FeedbackValue = 'positive' | 'negative';

@Entity({ name: 'message_feedback' })
@Unique(['message', 'userId'])
export class MessageFeedback {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => ChatMessage, { onDelete: 'CASCADE' })
  message!: Relation<ChatMessage>;

  @Column({ type: 'uuid' })
  messageId!: string;

  @Column({ type: 'integer' })
  userId!: number;

  @Column({ type: 'varchar', length: 10 })
  value!: FeedbackValue;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
