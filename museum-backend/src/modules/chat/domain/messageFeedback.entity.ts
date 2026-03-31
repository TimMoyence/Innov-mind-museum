import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

import { ChatMessage } from './chatMessage.entity';

/** Allowed feedback values for a message. */
export type FeedbackValue = 'positive' | 'negative';

/** Represents a user's thumbs-up/down feedback on an assistant message. Mapped to `message_feedback`. */
@Entity({ name: 'message_feedback' })
@Unique(['message', 'userId'])
export class MessageFeedback {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => ChatMessage, { onDelete: 'CASCADE' })
  message!: ChatMessage;

  @Column({ type: 'uuid' })
  messageId!: string;

  @Column({ type: 'integer' })
  userId!: number;

  @Column({ type: 'varchar', length: 10 })
  value!: FeedbackValue;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
