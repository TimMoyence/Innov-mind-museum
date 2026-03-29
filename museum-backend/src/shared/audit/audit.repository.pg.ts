import { AuditLog } from './auditLog.entity';

import type { IAuditLogRepository } from './audit.repository.interface';
import type { AuditLogEntry } from './audit.types';
import type { DataSource, Repository } from 'typeorm';

/** TypeORM implementation of the audit log repository. INSERT-only by design. */
export class AuditRepositoryPg implements IAuditLogRepository {
  private readonly repo: Repository<AuditLog>;

  constructor(dataSource: DataSource) {
    this.repo = dataSource.getRepository(AuditLog);
  }

  /** Inserts a single audit log entry into the database. */
  async insert(entry: AuditLogEntry): Promise<void> {
    const entity = this.repo.create({
      action: entry.action,
      actorType: entry.actorType,
      actorId: entry.actorId ?? null,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      metadata: entry.metadata ?? null,
      ip: entry.ip ?? null,
      requestId: entry.requestId ?? null,
    });
    await this.repo.save(entity);
  }

  /** Inserts multiple audit log entries in a single batched query. */
  async insertBatch(entries: AuditLogEntry[]): Promise<void> {
    if (entries.length === 0) return;

    const entities = entries.map((entry) =>
      this.repo.create({
        action: entry.action,
        actorType: entry.actorType,
        actorId: entry.actorId ?? null,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        metadata: entry.metadata ?? null,
        ip: entry.ip ?? null,
        requestId: entry.requestId ?? null,
      }),
    );
    await this.repo.save(entities);
  }
}
