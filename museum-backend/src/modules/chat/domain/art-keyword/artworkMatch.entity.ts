import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { ChatMessage } from '@modules/chat/domain/message/chatMessage.entity';

import type { Relation } from 'typeorm';

/** Represents an artwork identified from a user message (image or text). Mapped to `artwork_matches`. */
@Entity({ name: 'artwork_matches' })
export class ArtworkMatch {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('IDX_artwork_matches_messageId')
  @ManyToOne(() => ChatMessage, (message) => message.artworkMatches, {
    onDelete: 'CASCADE',
  })
  message!: Relation<ChatMessage>;

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
