import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 *
 */
@Entity({ name: 'support_tickets' })
export class SupportTicket {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'integer' })
  userId!: number;

  @Column({ type: 'varchar', length: 256 })
  subject!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'varchar', length: 16, default: 'open' })
  status!: string;

  @Column({ type: 'varchar', length: 8, default: 'medium' })
  priority!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  category!: string | null;

  @Column({ type: 'integer', nullable: true, name: 'assigned_to' })
  assignedTo!: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
