import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import type { LeadPayload, LeadStatus, LeadType } from '@modules/leads/domain/lead/lead.types';

/**
 * Cycle B — persisted lead (spec R4, design §4). Conventions mirror
 * `support/domain/ticket/supportTicket.entity.ts` (uuid PK, varchar(16) status,
 * jsonb payload, timestamptz create/update date columns).
 *
 * Autonomous entity — NO cross-entity FK, so no `Relation<T>` needed
 * (lib-docs/typeorm/LESSONS.md:19-24 n/a; B2B leads are not bound to a user
 * account — spec §8 Q3).
 *
 * Partial indexes accelerate the retry/dedup/retention read paths. The jsonb
 * expression index on `(LOWER(payload->>'email'))` for `deleteByEmail` (R20)
 * is NOT expressible from the decorator — it is added directly in the generated
 * migration (design §4, T1.4).
 */
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

  /** sha256(type|email|museum) for B2B dedup (R15); null for beta/paywall. */
  @Column({ type: 'varchar', length: 80, nullable: true })
  dedupKey!: string | null;

  @Column({ type: 'integer', default: 0 })
  attempts!: number;

  /** Sliced ≤800 (mirror brevo notifier .slice(0,800)); NEVER api-key/extra PII. */
  @Column({ type: 'text', nullable: true })
  lastError!: string | null;

  /** Applicative backoff (R11): retry job only selects rows where this <= NOW(). */
  @Column({ type: 'timestamptz', nullable: true })
  nextEligibleAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  deliveredAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
