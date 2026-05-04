import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Represents a user review of the application.
 */
@Entity({ name: 'reviews' })
export class Review {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'integer' })
  userId!: number;

  @Column({ type: 'varchar', length: 128 })
  userName!: string;

  @Column({ type: 'smallint' })
  rating!: number;

  @Column({ type: 'text' })
  comment!: string;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
