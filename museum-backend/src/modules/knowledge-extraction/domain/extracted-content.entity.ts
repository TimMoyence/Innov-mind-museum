import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum ExtractedContentStatus {
  SCRAPED = 'scraped',
  CLASSIFIED = 'classified',
  FAILED = 'failed',
  LOW_CONFIDENCE = 'low_confidence',
}

/**
 *
 */
@Entity({ name: 'extracted_content' })
export class ExtractedContent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 2048 })
  url!: string;

  @Column({ type: 'varchar', length: 500 })
  title!: string;

  @Column({ type: 'text' })
  textContent!: string;

  @CreateDateColumn({ type: 'timestamp' })
  scrapedAt!: Date;

  @Column({ type: 'varchar', length: 64 })
  contentHash!: string;

  @Column({
    type: 'enum',
    enum: ExtractedContentStatus,
    default: ExtractedContentStatus.SCRAPED,
  })
  status!: ExtractedContentStatus;
}
