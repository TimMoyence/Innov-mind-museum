import pool from '@data/db';

import type { IAuditLogRepository } from './audit.repository.interface';
import type { AuditLogEntry } from './audit.types';

/** PostgreSQL implementation of the audit log repository. INSERT-only by design. */
export class AuditRepositoryPg implements IAuditLogRepository {
  /** Inserts a single audit log entry into the database. */
  async insert(entry: AuditLogEntry): Promise<void> {
    await pool.query(
      `INSERT INTO "audit_logs" (action, actor_type, actor_id, target_type, target_id, metadata, ip, request_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        entry.action,
        entry.actorType,
        entry.actorId ?? null,
        entry.targetType ?? null,
        entry.targetId ?? null,
        entry.metadata ? JSON.stringify(entry.metadata) : null,
        entry.ip ?? null,
        entry.requestId ?? null,
      ],
    );
  }

  /** Inserts multiple audit log entries in a single batched query. */
  async insertBatch(entries: AuditLogEntry[]): Promise<void> {
    if (entries.length === 0) return;

    const values: unknown[] = [];
    const placeholders: string[] = [];
    let idx = 1;

    for (const entry of entries) {
      placeholders.push(
        `($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4}, $${idx + 5}, $${idx + 6}, $${idx + 7})`,
      );
      values.push(
        entry.action,
        entry.actorType,
        entry.actorId ?? null,
        entry.targetType ?? null,
        entry.targetId ?? null,
        entry.metadata ? JSON.stringify(entry.metadata) : null,
        entry.ip ?? null,
        entry.requestId ?? null,
      );
      idx += 8;
    }

    await pool.query(
      `INSERT INTO "audit_logs" (action, actor_type, actor_id, target_type, target_id, metadata, ip, request_id)
       VALUES ${placeholders.join(', ')}`,
      values,
    );
  }
}
