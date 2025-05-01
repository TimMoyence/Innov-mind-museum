import {
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Column,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { User } from '@modules/auth/core/domain/user.entity';
import { ImageInsightMessage } from './imageInsightMessage.entity';

@Entity('image_insight_conversations')
export class ImageInsightConversation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => User, { eager: true })
  user!: User;

  @Column({ nullable: true })
  imageUrl?: string;

  @OneToMany(() => ImageInsightMessage, (m) => m.conversation, {
    cascade: true,
    eager: true,
  })
  messages!: ImageInsightMessage[];

  @CreateDateColumn()
  createdAt!: Date;
}
