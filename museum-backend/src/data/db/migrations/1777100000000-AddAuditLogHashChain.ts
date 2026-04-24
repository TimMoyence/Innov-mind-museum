import { createHash } from 'node:crypto';

import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Canonical JSON stringify with sorted keys (deep).
 *
 * KEEP IN SYNC WITH src/shared/audit/audit-chain.ts (computeRowHash). The
 * canonical definition lives there; this migration duplicates the logic only
 * because TypeORM's migration CLI runner cannot reliably import compiled app
 * code at runtime. Parity is pinned by the test
 * `tests/unit/audit/audit-chain-migration-parity.test.ts`.
 */
function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  const keys = Object.keys(v as Record<string, unknown>).sort((a, b) => a.localeCompare(b));
  return (
    '{' +
    keys
      .map((k) => JSON.stringify(k) + ':' + stableStringify((v as Record<string, unknown>)[k]))
      .join(',') +
    '}'
  );
}

/**
 * Adds tamper-evident SHA-256 hash chain columns to `audit_logs`:
 *   - prev_hash: hash of the previous row (by creation order); genesis = 64 zeros.
 *   - row_hash: hash of (id, actor_id, action, target_type, target_id, metadata, created_at, prev_hash).
 *
 * Any offline mutation (e.g. a DBA bypassing triggers) breaks the chain and is
 * detected by verifyAuditChain().
 *
 * Backfill: the up() re-walks the existing rows in creation order and recomputes
 * the chain in a single idempotent UPDATE loop.
 */
export class AddAuditLogHashChain1777100000000 implements MigrationInterface {
  name = 'AddAuditLogHashChain1777100000000';

  /** Apply the AddAuditLogHashChain migration. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add the two new columns. row_hash is initially nullable so existing
    //    rows can be backfilled before we flip it to NOT NULL.
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "prev_hash" VARCHAR(64)`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "row_hash" VARCHAR(64)`,
    );

    // 2. Backfill — walk oldest → newest and recompute chain.
    //    We bypass the append-only trigger by setting the session whitelist
    //    variable added in AddAuditLogAnonymizationWhitelist (applied after
    //    this migration; until then there are no rows to backfill in prod).
    //    If rows already exist, we temporarily drop + re-add the UPDATE trigger
    //    to unblock the one-shot backfill.
    const existing = await queryRunner.query(
      `SELECT id, actor_id, action, target_type, target_id, metadata, created_at
         FROM "audit_logs"
        ORDER BY "created_at" ASC, "id" ASC`,
    );

    if (existing.length > 0) {
      await queryRunner.query(`DROP TRIGGER IF EXISTS trg_audit_logs_no_update ON "audit_logs"`);

      const genesis = '0'.repeat(64);
      let prev = genesis;
      for (const row of existing as {
        id: string;
        actor_id: number | null;
        action: string;
        target_type: string | null;
        target_id: string | null;
        metadata: Record<string, unknown> | null;
        created_at: Date;
      }[]) {
        const payload = [
          row.id,
          row.actor_id ?? '',
          row.action,
          row.target_type ?? '',
          row.target_id ?? '',
          row.metadata === null ? '' : stableStringify(row.metadata),
          row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
          prev,
        ].join('|');
        const rowHash = createHash('sha256').update(payload).digest('hex');
        await queryRunner.query(
          `UPDATE "audit_logs" SET "prev_hash" = $1, "row_hash" = $2 WHERE "id" = $3`,
          [prev, rowHash, row.id],
        );
        prev = rowHash;
      }

      // Re-install the append-only UPDATE trigger.
      await queryRunner.query(`
        CREATE TRIGGER trg_audit_logs_no_update
          BEFORE UPDATE ON "audit_logs"
          FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation()
      `);
    }

    // 3. Flip row_hash to NOT NULL now that everything is populated.
    await queryRunner.query(`ALTER TABLE "audit_logs" ALTER COLUMN "row_hash" SET NOT NULL`);

    // 4. Index on created_at ASC for fast chain-walk (inverse of existing DESC index).
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_audit_logs_created_at_asc" ON "audit_logs" ("created_at" ASC, "id" ASC)`,
    );
  }

  /** Revert the AddAuditLogHashChain migration. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_logs_created_at_asc"`);
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "row_hash"`);
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "prev_hash"`);
  }
}
