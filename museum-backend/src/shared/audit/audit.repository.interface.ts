import type { AuditLogEntry } from './audit.types';
import type { AuditLog } from './auditLog.entity';

export interface IAuditLogRepository {
  insert(entry: AuditLogEntry): Promise<void>;
  insertBatch(entries: AuditLogEntry[]): Promise<void>;
  /**
   * DSAR (Art.15, B3, spec Q6) — the data subject's own audit rows
   * (`actor_id = actorId`), read-only on the existing column. Additive, no
   * migration; the 1/7-day DSAR rate limit makes the missing `actor_id` index
   * acceptable (ops note: index at high MAU).
   */
  listForActor(actorId: number): Promise<AuditLog[]>;
}
