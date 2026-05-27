import { Lead } from '@modules/leads/domain/lead/lead.entity';

import type { ILeadRepository } from '@modules/leads/domain/lead/lead.repository.interface';
import type { InsertLeadInput, LeadDTO } from '@modules/leads/domain/lead/lead.types';
import type { DataSource, Repository } from 'typeorm';

/**
 * Cycle B (« Aucun lead perdu ») — PG adapter for `ILeadRepository` (T2.2,
 * design §3). Mirror of `support.repository.pg.ts` (`dataSource.getRepository`
 * + `toDTO`). Use-cases depend on the port, never this adapter (hexagonal).
 *
 * TypeORM gotchas applied (lib-docs/typeorm/LESSONS.md):
 * - `attempts++` is atomic via QueryBuilder `.set({ attempts: () => '"attempts" + 1' })`
 *   so concurrent retries never lose an increment (LESSONS:12-17 — never
 *   `.set({ field: undefined })`; we never clear a column via `undefined`).
 * - `purgeDeliveredOlderThan` / `deleteByEmail` read the rowCount from the
 *   `DELETE … RETURNING` tuple `result[1]`, NEVER `result.length` (always 2),
 *   to avoid the prune-cron infinite-loop class of bug (LESSONS:5-10).
 * - `lastError` is sliced ≤800 (mirror the Brevo notifier `.slice(0,800)`) and
 *   NEVER carries the api-key or extra PII beyond the payload already stored.
 */

const LAST_ERROR_MAX = 800;

/** Maps the persisted entity to its repository DTO (timestamps → ISO strings). */
function toDTO(entity: Lead): LeadDTO {
  return {
    id: entity.id,
    type: entity.type,
    status: entity.status,
    payload: entity.payload,
    dedupKey: entity.dedupKey ?? null,
    attempts: entity.attempts,
    lastError: entity.lastError ?? null,
    nextEligibleAt: entity.nextEligibleAt ? entity.nextEligibleAt.toISOString() : null,
    deliveredAt: entity.deliveredAt ? entity.deliveredAt.toISOString() : null,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}

export class LeadRepositoryPg implements ILeadRepository {
  private readonly repo: Repository<Lead>;

  constructor(dataSource: DataSource) {
    this.repo = dataSource.getRepository(Lead);
  }

  async insertPending(input: InsertLeadInput): Promise<LeadDTO> {
    const entity = this.repo.create({
      type: input.type,
      status: 'pending',
      payload: input.payload,
      dedupKey: input.dedupKey ?? null,
      attempts: 0,
    });
    const saved = await this.repo.save(entity);
    return toDTO(saved);
  }

  async markDelivered(id: string): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .update(Lead)
      .set({
        status: 'delivered',
        deliveredAt: () => 'NOW()',
        attempts: () => '"attempts" + 1',
      })
      .where('id = :id', { id })
      .execute();
  }

  async markFailed(id: string, lastError: string): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .update(Lead)
      .set({
        status: 'failed',
        lastError: lastError.slice(0, LAST_ERROR_MAX),
        attempts: () => '"attempts" + 1',
      })
      .where('id = :id', { id })
      .execute();
  }

  async scheduleNextAttempt(id: string, nextEligibleAtIso: string | null): Promise<void> {
    // R11 applicative backoff. Use a literal `null` / explicit value, NEVER
    // `undefined` (lib-docs/typeorm/LESSONS.md:12-17 — `.set({field:undefined})`
    // is silently skipped, no `SET … = NULL` emitted).
    await this.repo
      .createQueryBuilder()
      .update(Lead)
      .set({ nextEligibleAt: nextEligibleAtIso === null ? null : new Date(nextEligibleAtIso) })
      .where('id = :id', { id })
      .execute();
  }

  async selectRedeliverable(maxAttempts: number, batchLimit: number): Promise<LeadDTO[]> {
    const rows = await this.repo
      .createQueryBuilder('l')
      .where(`l.status IN ('pending','failed')`)
      .andWhere('l.attempts < :maxAttempts', { maxAttempts })
      .andWhere('(l.nextEligibleAt IS NULL OR l.nextEligibleAt <= NOW())')
      .orderBy('l.nextEligibleAt', 'ASC', 'NULLS FIRST')
      .addOrderBy('l.createdAt', 'ASC')
      .limit(batchLimit)
      .getMany();
    return rows.map(toDTO);
  }

  async findActiveByDedupKey(dedupKey: string): Promise<LeadDTO | null> {
    const row = await this.repo
      .createQueryBuilder('l')
      .where('l.dedupKey = :dedupKey', { dedupKey })
      .andWhere(`l.status IN ('pending','delivered')`)
      .getOne();
    return row ? toDTO(row) : null;
  }

  async purgeDeliveredOlderThan(cutoffIso: string, batchLimit: number): Promise<number> {
    // DELETE … RETURNING → TypeORM normalises raw to [rows, rowCount]; read
    // result[1] (LESSONS:5-10 — result.length is always 2, infinite-loop class).
    const result = await this.repo.query<[unknown[], number] | undefined>(
      `DELETE FROM "leads"
       WHERE id IN (
         SELECT id FROM "leads"
         WHERE "status" = 'delivered' AND "deliveredAt" < $1
         ORDER BY "deliveredAt" ASC
         LIMIT $2
       )
       RETURNING id`,
      [cutoffIso, batchLimit],
    );
    return Array.isArray(result) && typeof result[1] === 'number' ? result[1] : 0;
  }

  async deleteByEmail(emailNormalized: string): Promise<number> {
    // GDPR Art.17 (R20) — purge every lead matching the normalised email,
    // regardless of status. Backed by IDX_leads_payload_email expression index.
    const result = await this.repo.query<[unknown[], number] | undefined>(
      `DELETE FROM "leads" WHERE LOWER(payload->>'email') = LOWER($1) RETURNING id`,
      [emailNormalized],
    );
    return Array.isArray(result) && typeof result[1] === 'number' ? result[1] : 0;
  }
}
