import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { User } from '@modules/auth/core/domain/user.entity';
import { ChatMessage } from './chatMessage.entity';

@Entity({ name: 'chat_sessions' })
export class ChatSession {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => User, { nullable: true, eager: false })
  user?: User | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  locale?: string | null;

  @Column({ type: 'boolean', default: false })
  museumMode!: boolean;

  @OneToMany(() => ChatMessage, (message) => message.session, {
    cascade: false,
    eager: false,
  })
  messages!: ChatMessage[];

  @CreateDateColumn({ type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt!: Date;
}
