import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * C1 Phase 2 — adds the `super_admin` value to `users_role_enum`. Pairs
 * with `BackfillSuperAdminOwner1778240010000` which assigns the new role
 * to the platform owner in a SEPARATE transaction (PostgreSQL forbids
 * using a freshly-added enum value within the transaction that added it,
 * see `check_safe_enum_use` and SQLSTATE 55P04).
 *
 * Why a dedicated tier above `admin`:
 *   - `admin` is granted to B2B museum operators (one per partner museum
 *     post-launch) for tenant-scoped admin panel access.
 *   - `super_admin` is reserved for the Musaium platform operator and
 *     gates cross-tenant ops surfaces (Grafana iframe at
 *     `/admin/ops/grafana`, latency p99 dashboards, alert state).
 *
 * Down migration: PostgreSQL has no first-class way to drop an enum
 * value once used. Standard workaround (CREATE new type → ALTER COLUMN
 * USING cast → DROP old type) is destructive and cannot be made
 * round-trip safe in a generic migration runner. Down is an explicit
 * no-op (matches `BackfillUnverifiedEmailFlags1778235096875`).
 */
export class AddSuperAdminRoleAndBackfill1778240000000 implements MigrationInterface {
  name = 'AddSuperAdminRoleAndBackfill1778240000000';

  /** Apply: extend the enum. Idempotent via `IF NOT EXISTS`. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."users_role_enum" ADD VALUE IF NOT EXISTS 'super_admin'`,
    );
  }

  /** No-op — see class doc. */
  public async down(_queryRunner: QueryRunner): Promise<void> {
    await Promise.resolve();
  }
}
