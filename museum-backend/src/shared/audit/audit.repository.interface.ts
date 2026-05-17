import type { AuditLogEntry } from './audit.types';

export interface IAuditLogRepository {
  insert(entry: AuditLogEntry): Promise<void>;
  insertBatch(entries: AuditLogEntry[]): Promise<void>;
}
