import { randomUUID } from 'node:crypto';

import { AUDIT_CHAIN_GENESIS_HASH, computeRowHash } from './audit-chain';
import { AuditLog } from './auditLog.entity';

import type { IAuditLogRepository } from './audit.repository.interface';
import type { AuditLogEntry } from './audit.types';
import type { DataSource, EntityManager } from 'typeorm';

/**
 * Cluster-wide advisory lock serializing audit-log INSERTs so the hash chain
 * cannot interleave. `pg_advisory_xact_lock` released at COMMIT/ROLLBACK.
 * Arbitrary but stable int64. See CLAUDE.md gotcha: ADR-054 Merkle batch redesign
 * planned for 100k MAU (per-row hash chain caps throughput 50-200/s).
 */
const AUDIT_CHAIN_LOCK_KEY = 0x75f1_4b0c_6dbe_a111n;

/**
 * INSERT-only audit log. Hash-chain discipline:
 *   - Each INSERT in a transaction that FIRST takes cluster-wide advisory
 *     lock (serializing chain appends), THEN fetches tail row_hash, computes
 *     new row_hash, writes row.
 *   - `FOR UPDATE SKIP LOCKED` on tail row insufficient: chain is "virtual"
 *     (defined by creation order, not FK), so two concurrent inserts would
 *     both observe same tail and fork. Advisory lock gives required
 *     serialization without table-level locking.
 */
export class AuditRepositoryPg implements IAuditLogRepository {
  private readonly dataSource: DataSource;

  constructor(dataSource: DataSource) {
    this.dataSource = dataSource;
  }

  async insert(entry: AuditLogEntry): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await this.acquireChainLock(manager);
      await this.appendOne(manager, entry);
    });
  }

  /** Single transaction, chained in order. */
  async insertBatch(entries: AuditLogEntry[]): Promise<void> {
    if (entries.length === 0) return;

    await this.dataSource.transaction(async (manager) => {
      await this.acquireChainLock(manager);
      for (const entry of entries) {
        await this.appendOne(manager, entry);
      }
    });
  }

  /**
   * DSAR (Art.15, B3, spec Q6) — returns the data subject's own audit rows
   * (`actor_id = actorId`), newest first. Read-only; the INSERT-only hash chain
   * is untouched. The full-row entity is returned; the export use case maps it
   * to a DTO that excludes `prevHash` / `rowHash` (R14).
   */
  async listForActor(actorId: number): Promise<AuditLog[]> {
    return await this.dataSource.getRepository(AuditLog).find({
      where: { actorId },
      order: { createdAt: 'DESC' },
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
