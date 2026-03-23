import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** Immutable audit log entry. INSERT only — no UPDATE/DELETE at the application level. */
@Entity({ name: 'audit_logs' })
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 64 })
  action!: string;

  @Column({ type: 'varchar', length: 16, name: 'actor_type' })
  actorType!: string;

  @Column({ type: 'integer', nullable: true, name: 'actor_id' })
  actorId!: number | null;

  @Column({ type: 'varchar', length: 64, nullable: true, name: 'target_type' })
  targetType!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'target_id' })
  targetId!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @Column({ type: 'inet', nullable: true })
  ip!: string | null;

  @Column({ type: 'uuid', nullable: true, name: 'request_id' })
  requestId!: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
