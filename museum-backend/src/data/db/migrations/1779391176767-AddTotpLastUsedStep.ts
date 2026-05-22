import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * I-SEC7a / R6 — RFC 6238 §5.2 replay-protection ledger.
 *
 * Adds `last_used_step bigint NULL` to `totp_secrets`. `verifyMfa` /
 * `challengeMfa` populate this column with the accepted step (= floor(unixTime/30))
 * each time a code passes. The use case rejects codes whose accepted step is
 * `<= last_used_step`, closing the "code is valid for 90 s → replay within window"
 * vector that pure `validate({window:1})` did not address.
 *
 * Zero-downtime / nullable-then-stamp : existing rows retain `last_used_step IS NULL`,
 * which the use case treats as "never used" → the FIRST post-deploy code accepts and
 * stamps. No backfill, no index (the column is only ever read for the row already
 * identified by `user_id` PK).
 *
 * Generated via `node scripts/migration-cli.cjs generate --name=AddTotpLastUsedStep`
 * (MIGRATION_GOVERNANCE.md). The raw generator output included unrelated drift
 * (FK renames, dropped indexes, dropped/re-added columns) from a dev DB that was
 * not fully migrated against `main`. Per design §4 the migration body is restricted
 * to the intended scope ; the unrelated drift is tracked separately under TD-MIG-*
 * (out of scope for this run, see `docs/TECH_DEBT.md`).
 */
export class AddTotpLastUsedStep1779391176767 implements MigrationInterface {
  name = 'AddTotpLastUsedStep1779391176767';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "totp_secrets" ADD COLUMN IF NOT EXISTS "last_used_step" bigint`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "totp_secrets" DROP COLUMN IF EXISTS "last_used_step"`);
  }
}
