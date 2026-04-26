import { logger } from '@shared/logger/logger';

import type { IAuditLogRepository } from './audit.repository.interface';
import type { AuditLogEntry } from './audit.types';

/**
 * Awaitable audit logging service.
 *
 * Returns a Promise so callers can `await` durability before responding to the
 * user (essential for SOC2 CC7.2 / GDPR Art. 30: an audit row MUST exist before
 * the privileged action's HTTP response is observable). The repository
 * serialises writes via `pg_advisory_xact_lock` for chain integrity, so each
 * call costs ~5–100 ms — acceptable for privileged routes.
 *
 * Internal errors are caught and logged: an audit-pipeline failure must never
 * break the user request (the action already happened).
 */
export class AuditService {
  constructor(private readonly repository: IAuditLogRepository) {}

  /** Log a single audit event. Awaits the insert; never throws. */
  async log(entry: AuditLogEntry): Promise<void> {
    try {
      await this.repository.insert(entry);
    } catch (error) {
      logger.error('audit_log_failed', {
        action: entry.action,
        error: error instanceof Error ? error.message : String(error),
      });
      // Do NOT rethrow — audit failure must not break the user request.
    }
  }

  /** Log multiple audit events in a single batch. Awaits the insert; never throws. */
  async logBatch(entries: AuditLogEntry[]): Promise<void> {
    if (entries.length === 0) return;
    try {
      await this.repository.insertBatch(entries);
    } catch (error) {
      logger.error('audit_log_batch_failed', {
        count: entries.length,
        error: error instanceof Error ? error.message : String(error),
      });
      // Do NOT rethrow — audit failure must not break the user request.
    }
  }
}
