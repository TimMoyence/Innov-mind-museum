import type { AuditLogEntry } from './audit.types';
import type { AuditLog } from './auditLog.entity';

export interface IAuditLogRepository {
  insert(entry: AuditLogEntry): Promise<void>;
  insertBatch(entries: AuditLogEntry[]): Promise<void>;
  listForActor(actorId: number): Promise<AuditLog[]>;
}
