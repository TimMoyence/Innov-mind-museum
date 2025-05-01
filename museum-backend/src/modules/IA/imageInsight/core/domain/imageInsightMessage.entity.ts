import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ImageInsightConversation } from './imageInsightConversation.entity';

@Entity({ name: 'image_insight_messages' })
export class ImageInsightMessage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => ImageInsightConversation, (conv) => conv.messages, {
    onDelete: 'CASCADE',
  })
  conversation!: ImageInsightConversation;

  @Column()
  role!: 'user' | 'assistant';

  @Column('text')
  content!: string;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt!: Date;
}
