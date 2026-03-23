import type { AuditLogEntry } from './audit.types';

/** Port for audit log persistence. */
export interface IAuditLogRepository {
  /** Insert a single audit log entry. */
  insert(entry: AuditLogEntry): Promise<void>;

  /** Insert multiple audit log entries in a single query. */
  insertBatch(entries: AuditLogEntry[]): Promise<void>;
}
