import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

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

  @Index('IDX_support_tickets_assigned_to', { where: '"assigned_to" IS NOT NULL' })
  @Column({ type: 'integer', nullable: true, name: 'assigned_to' })
  assignedTo!: number | null;

  /**
   * B2B multi-tenant scope (Wave B C7 / R-C7a / R-C7c). FK → `museums.id`
   * (integer PK). Nullable so existing tickets (pre-multi-tenant) survive
   * the migration without backfill. Partial index excludes NULLs.
   *
   * Spec: design.md §4 M3, T-B8.
   */
  @Index('IDX_support_tickets_museum_id', { where: '"museum_id" IS NOT NULL' })
  @Column({ type: 'integer', nullable: true, name: 'museum_id' })
  museumId?: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
