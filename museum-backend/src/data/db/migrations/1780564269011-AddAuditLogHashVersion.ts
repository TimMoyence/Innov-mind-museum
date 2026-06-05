import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * AUDIT-01 / TD-61 — adds the `hash_version` discriminator to `audit_logs`.
 *
 * The audit hash chain switches from the legacy top-level-only metadata serializer
 * (v1, which collapsed nested objects to `{}` → collision) to a deep-recursive
 * canonical serializer (v2). To verify already-persisted rows without false BREAK,
 * each row records the serializer version it was hashed with.
 *
 * `hash_version` is carried OUT of the hash payload (like `ip` / `request_id`), so
 * adding the column invalidates NO existing `row_hash`. `DEFAULT 1` stamps every
 * pre-existing row as legacy without a recompute loop. New writes set `2`
 * (`CURRENT_HASH_VERSION`).
 *
 * `ADD COLUMN` does not UPDATE `row_hash`, so the append-only trigger
 * `prevent_audit_log_mutation` (UPDATE-only) is NOT triggered — no DROP/re-ADD of
 * the trigger, no SAVEPOINT, no backfill loop (lib-docs/typeorm/PATTERNS.md §3.8/§7.1).
 *
 * NOTE (governance): generated via `node scripts/migration-cli.cjs generate`, then
 * trimmed to ONLY the `hash_version` add/drop. The full generated diff carried
 * unrelated pre-existing entity↔clean-DB drift (FK names, pgvector `halfvec` vs
 * `text`, HNSW index) that is out of scope for this run and must not ship here.
 */
export class AddAuditLogHashVersion1780564269011 implements MigrationInterface {
  name = 'AddAuditLogHashVersion1780564269011';

  /** Apply: add the hash_version column (legacy rows default to 1). */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "hash_version" SMALLINT NOT NULL DEFAULT 1`,
    );
  }

  /** Revert: drop the hash_version column (non-destructive of row_hash). */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "hash_version"`);
  }
}
