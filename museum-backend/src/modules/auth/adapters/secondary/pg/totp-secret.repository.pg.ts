import { TotpSecret, type TotpRecoveryCode } from '@modules/auth/domain/totp/totp-secret.entity';

import type { ITotpSecretRepository } from '@modules/auth/domain/totp/totp-secret.repository.interface';
import type { DataSource, Repository } from 'typeorm';

export class TotpSecretRepositoryPg implements ITotpSecretRepository {
  private readonly repo: Repository<TotpSecret>;

  constructor(dataSource: DataSource) {
    this.repo = dataSource.getRepository(TotpSecret);
  }

  /** `recoveryCodes` always materialises as array (PG default `[]`). */
  async findByUserId(userId: number): Promise<TotpSecret | null> {
    return await this.repo.findOne({ where: { userId } });
  }

  /** Atomic. Resets `enrolledAt=null` so new enrollment must be verified before gating login. */
  async upsertEnrollment(input: {
    userId: number;
    secretEncrypted: string;
    recoveryCodes: TotpRecoveryCode[];
  }): Promise<TotpSecret> {
    const existing = await this.repo.findOne({ where: { userId: input.userId } });
    if (existing) {
      existing.secretEncrypted = input.secretEncrypted;
      existing.recoveryCodes = input.recoveryCodes;
      existing.enrolledAt = null;
      existing.lastUsedAt = null;
      return await this.repo.save(existing);
    }

    const entity = this.repo.create({
      userId: input.userId,
      secretEncrypted: input.secretEncrypted,
      recoveryCodes: input.recoveryCodes,
      enrolledAt: null,
      lastUsedAt: null,
    });
    return await this.repo.save(entity);
  }

  /** Conditional UPDATE keeps earliest enrollment timestamp even on accidental re-verify. */
  async markEnrolled(userId: number, at: Date): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .update(TotpSecret)
      .set({ enrolledAt: at, lastUsedAt: at })
      .where('user_id = :userId AND enrolled_at IS NULL', { userId })
      .execute();
  }

  /**
   * RFC 6238 §5.2 replay-protection — atomic compare-and-set. The `WHERE` guard
   * (`last_used_step IS NULL OR last_used_step < :step`) pushes the precondition
   * into the DB write so two concurrent requests carrying the SAME accepted step
   * serialise on the row write-lock: the first stamps the step, the second
   * re-evaluates the predicate against the committed value and matches 0 rows.
   * Returns `UpdateResult.affected` (lib-docs/typeorm/LESSONS.md 2026-05-20 —
   * `affected` is the atomicity signal; the prior unconditional `repo.update`
   * was the TOCTOU defect). PG `bigint` → JS string per the column mapping, so
   * `step` is compared as bigint via the `::bigint` cast on the bound param.
   * Never pass `undefined` — TypeORM 0.3.x silent-skips it (LESSONS.md
   * verifyEmail replay 2026-05).
   */
  async markUsed(userId: number, at: Date, step: number): Promise<{ affected: number }> {
    const result = await this.repo
      .createQueryBuilder()
      .update(TotpSecret)
      .set({ lastUsedAt: at, lastUsedStep: String(step) })
      .where('user_id = :userId AND (last_used_step IS NULL OR last_used_step < :step::bigint)', {
        userId,
        step: String(step),
      })
      .execute();
    return { affected: result.affected ?? 0 };
  }

  /** Atomic full-array replace. */
  async updateRecoveryCodes(userId: number, codes: TotpRecoveryCode[]): Promise<void> {
    await this.repo.update({ userId }, { recoveryCodes: codes });
  }

  /**
   * Atomic single-entry recovery-code consumption (design §9 D1). One `jsonb_set`
   * UPDATE stamps `consumedAt` at the JS-resolved array `index`, guarded by
   * `WHERE (recovery_codes -> :idx ->> 'consumedAt') IS NULL` so a code is honoured
   * at most once under concurrency: PG evaluates the predicate under the row
   * write-lock, the second concurrent transaction re-reads the first's committed
   * value and matches 0 rows. Returns `UpdateResult.affected` (1 = consumed by this
   * caller, 0 = already consumed OR out-of-range index — the `-> :idx` lookup
   * yields SQL NULL for a missing element, `->> 'consumedAt'` is then NULL too, so
   * the `IS NULL` guard would pass; the index out-of-range case is excluded by the
   * additional `jsonb_array_length` bound so it returns 0 deterministically).
   *
   * Raw-SQL `jsonb_set` bypasses the column's read-side `jsonbValidator`
   * transformer (write path); the subsequent `findByUserId` re-validates the
   * shape on read (design §4 note). The `:path` is a `text[]` literal built from
   * the integer index; `to_jsonb(:at::text)` wraps the ISO timestamp as a jsonb
   * string. Never `.set({field: undefined})` — uses a raw `() => 'jsonb_set(...)'`
   * expression (LESSONS.md verifyEmail replay 2026-05).
   */
  async consumeRecoveryCode(
    userId: number,
    index: number,
    at: Date,
  ): Promise<{ affected: number }> {
    const result = await this.repo
      .createQueryBuilder()
      .update(TotpSecret)
      .set({
        recoveryCodes: () => `jsonb_set(recovery_codes, :path::text[], to_jsonb(:at::text), false)`,
      })
      .where(
        `user_id = :userId
         AND :idx < jsonb_array_length(recovery_codes)
         AND (recovery_codes -> :idx ->> 'consumedAt') IS NULL`,
        { userId, idx: index },
      )
      .setParameters({ path: `{${String(index)},consumedAt}`, at: at.toISOString(), idx: index })
      .execute();
    return { affected: result.affected ?? 0 };
  }

  /** Idempotent. */
  async deleteByUserId(userId: number): Promise<void> {
    await this.repo.delete({ userId });
  }
}
