import { randomUUID } from 'node:crypto';

import { AUDIT_CHAIN_GENESIS_HASH, computeRowHash } from './audit-chain';
import { AuditLog } from './auditLog.entity';

import type { IAuditLogRepository } from './audit.repository.interface';
import type { AuditLogEntry } from './audit.types';
import type { DataSource, EntityManager } from 'typeorm';

/**
 * Advisory-lock key used to serialize audit-log INSERTs across the cluster so
 * the hash chain cannot interleave. `pg_advisory_xact_lock` is released
 * automatically at COMMIT/ROLLBACK. Key is an arbitrary but stable int64.
 */
const AUDIT_CHAIN_LOCK_KEY = 0x75f1_4b0c_6dbe_a111n;

/**
 * TypeORM implementation of the audit log repository. INSERT-only by design.
 *
 * Hash-chain discipline:
 *   - Each INSERT runs inside a transaction that first takes a cluster-wide
 *     advisory lock (serializing chain appends), then fetches the tail row's
 *     row_hash, computes the new row_hash, and writes the row.
 *   - A simpler `FOR UPDATE SKIP LOCKED` on the tail row is insufficient
 *     because the chain is "virtual" (defined by creation order, not a FK),
 *     so two concurrent inserts would both observe the same tail and fork.
 *     The advisory lock gives us the required serialization without table-
 *     level locking.
 */
export class AuditRepositoryPg implements IAuditLogRepository {
  private readonly dataSource: DataSource;

  constructor(dataSource: DataSource) {
    this.dataSource = dataSource;
  }

  /** Inserts a single audit log entry with a freshly computed hash link. */
  async insert(entry: AuditLogEntry): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await this.acquireChainLock(manager);
      await this.appendOne(manager, entry);
    });
  }

  /** Inserts multiple audit log entries in a single transaction, chained in order. */
  async insertBatch(entries: AuditLogEntry[]): Promise<void> {
    if (entries.length === 0) return;

    await this.dataSource.transaction(async (manager) => {
      await this.acquireChainLock(manager);
      for (const entry of entries) {
        await this.appendOne(manager, entry);
      }
    });
  }

  private async acquireChainLock(manager: EntityManager): Promise<void> {
    await manager.query('SELECT pg_advisory_xact_lock($1)', [AUDIT_CHAIN_LOCK_KEY.toString()]);
  }

  private async appendOne(manager: EntityManager, entry: AuditLogEntry): Promise<void> {
    const tail = await manager.query(
      `SELECT "row_hash" FROM "audit_logs"
       ORDER BY "created_at" DESC, "id" DESC
       LIMIT 1`,
    );
    const prevHash: string = tail.length > 0 ? tail[0].row_hash : AUDIT_CHAIN_GENESIS_HASH;

    const id = randomUUID();
    const createdAt = new Date();
    const actorId = entry.actorId ?? null;
    const targetType = entry.targetType ?? null;
    const targetId = entry.targetId ?? null;
    const metadata = entry.metadata ?? null;

    const rowHash = computeRowHash(
      { id, actorId, action: entry.action, targetType, targetId, metadata, createdAt },
      prevHash,
    );

    const repo = manager.getRepository(AuditLog);
    const entity = repo.create({
      id,
      action: entry.action,
      actorType: entry.actorType,
      actorId,
      targetType,
      targetId,
      metadata,
      ip: entry.ip ?? null,
      requestId: entry.requestId ?? null,
      prevHash,
      rowHash,
      createdAt,
    });
    await repo.save(entity);
  }
}
