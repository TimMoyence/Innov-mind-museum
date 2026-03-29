import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

import { ChatMessage } from './chatMessage.entity';

/** Represents a user-submitted report on a chat message. Mapped to `message_reports`. */
@Entity({ name: 'message_reports' })
@Unique(['message', 'userId'])
export class MessageReport {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => ChatMessage, { onDelete: 'CASCADE' })
  message!: ChatMessage;

  @Column({ type: 'uuid' })
  messageId!: string;

  @Column({ type: 'integer' })
  userId!: number;

  @Column({ type: 'varchar', length: 20 })
  reason!: string;

  @Column({ type: 'text', nullable: true })
  comment!: string | null;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status!: string;

  @Column({ type: 'integer', nullable: true })
  reviewedBy!: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  reviewerNotes!: string | null;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt!: Date;
}
