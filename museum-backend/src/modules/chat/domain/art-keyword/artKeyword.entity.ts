import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

@Entity('art_keywords')
@Unique('UQ_art_keywords_keyword_locale', ['keyword', 'locale'])
export class ArtKeyword {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 200 })
  keyword!: string;

  @Column({ type: 'varchar', length: 10 })
  locale!: string;

  @Column({ type: 'varchar', length: 50, default: 'general' })
  category!: string;

  @Column({ type: 'int', default: 1 })
  hitCount!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
