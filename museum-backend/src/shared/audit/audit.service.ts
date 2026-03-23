import { logger } from '@shared/logger/logger';
import type { IAuditLogRepository } from './audit.repository.interface';
import type { AuditLogEntry } from './audit.types';

/** Fire-and-forget audit logging service. Never throws, never blocks the caller. */
export class AuditService {
  constructor(private readonly repository: IAuditLogRepository) {}

  /** Log a single audit event. Fire-and-forget. */
  log(entry: AuditLogEntry): void {
    this.repository.insert(entry).catch((error) => {
      logger.error('audit_log_failed', {
        action: entry.action,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  /** Log multiple audit events in a single batch. Fire-and-forget. */
  logBatch(entries: AuditLogEntry[]): void {
    if (entries.length === 0) return;
    this.repository.insertBatch(entries).catch((error) => {
      logger.error('audit_log_batch_failed', {
        count: entries.length,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }
}
