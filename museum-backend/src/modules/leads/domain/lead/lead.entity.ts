import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import type { LeadPayload, LeadStatus, LeadType } from '@modules/leads/domain/lead/lead.types';

@Entity({ name: 'leads' })
@Index('IDX_leads_redeliverable', ['status', 'attempts'], {
  where: `"status" IN ('pending', 'failed')`,
})
@Index('IDX_leads_dedup_key', ['dedupKey'], { where: `"dedupKey" IS NOT NULL` })
@Index('IDX_leads_delivered_at', ['deliveredAt'], { where: `"status" = 'delivered'` })
export class Lead {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 16 })
  type!: LeadType;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status!: LeadStatus;

  @Column({ type: 'jsonb' })
  payload!: LeadPayload;

  @Column({ type: 'varchar', length: 80, nullable: true })
  dedupKey!: string | null;

  @Column({ type: 'integer', default: 0 })
  attempts!: number;

  @Column({ type: 'text', nullable: true })
  lastError!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  nextEligibleAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  deliveredAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
