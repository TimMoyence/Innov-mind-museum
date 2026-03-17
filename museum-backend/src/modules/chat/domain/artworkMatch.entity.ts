import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { ChatMessage } from './chatMessage.entity';

@Entity({ name: 'artwork_matches' })
export class ArtworkMatch {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => ChatMessage, (message) => message.artworkMatches, {
    onDelete: 'CASCADE',
  })
  message!: ChatMessage;

  @Column({ type: 'varchar', length: 128, nullable: true })
  artworkId?: string | null;

  @Column({ type: 'varchar', length: 256, nullable: true })
  title?: string | null;

  @Column({ type: 'varchar', length: 256, nullable: true })
  artist?: string | null;

  @Column({ type: 'float', default: 0 })
  confidence!: number;

  @Column({ type: 'varchar', length: 512, nullable: true })
  source?: string | null;

  @Column({ type: 'varchar', length: 256, nullable: true })
  room?: string | null;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt!: Date;
}
