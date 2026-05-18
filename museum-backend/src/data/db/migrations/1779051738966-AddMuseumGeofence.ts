import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * W3 (geo + walk + intra-musée) — adds geofence storage to `museums`.
 *
 * Hybrid PostGIS / JSONB strategy (design.md §D1, spec R8) :
 *   - Try `CREATE EXTENSION IF NOT EXISTS postgis` inside try/catch.
 *   - On success → add `geofence geometry(Polygon, 4326)` + GIST index.
 *   - On failure (extension package missing, no superuser, etc.) → fall back
 *     to `geofence_bbox jsonb` (rectangle-only, in-app containment check).
 *
 * The migration is idempotent on both branches (uses `IF NOT EXISTS` /
 * `IF EXISTS`). The `down()` drops whichever column was created. The
 * `postgis` extension itself is NOT dropped — other features may add
 * geometry columns later, and `DROP EXTENSION` would cascade destructively.
 *
 * Verifier confirms the active mode via the `Geofence storage mode` log
 * line (logged via `console.info` here since `@shared/logger/logger` is
 * not import-safe from a migration's runtime context).
 */
export class AddMuseumGeofence1779051738966 implements MigrationInterface {
  name = 'AddMuseumGeofence1779051738966';

  /**
   * Tries PostGIS path first ; falls back to JSONB bbox on any error
   * (extension package not installed, no superuser privilege, etc.).
   *
   * Two execution modes coexist :
   *   - Default `pnpm migration:run` — each migration runs inside its own
   *     per-migration transaction. A failing `CREATE EXTENSION` would
   *     poison the outer txn (Postgres 25P02 "current transaction is
   *     aborted"). We wrap the probe in `SAVEPOINT postgis_probe` so the
   *     ROLLBACK TO SAVEPOINT on catch keeps the outer txn valid for the
   *     subsequent `ALTER TABLE`.
   *   - Integration harness `runMigrations({ transaction: 'none' })` —
   *     migrations execute outside any transaction (the integration
   *     harness avoids per-migration txns so it can DDL on a shared
   *     ephemeral DB). `SAVEPOINT` outside a transaction errors with
   *     "SAVEPOINT can only be used in transaction blocks". We detect
   *     `queryRunner.isTransactionActive` and skip the savepoint dance —
   *     a failing `CREATE EXTENSION` cannot poison anything when not
   *     wrapped in a txn, so plain try/catch is sufficient.
   *
   * Same fallback behaviour in both modes : success → PostGIS path,
   * failure → JSONB bbox.
   */
  public async up(queryRunner: QueryRunner): Promise<void> {
    const inTransaction = queryRunner.isTransactionActive;
    let postgisAvailable = false;
    if (inTransaction) {
      await queryRunner.query(`SAVEPOINT postgis_probe`);
    }
    try {
      await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS postgis`);
      if (inTransaction) {
        await queryRunner.query(`RELEASE SAVEPOINT postgis_probe`);
      }
      postgisAvailable = true;
    } catch (err) {
      if (inTransaction) {
        await queryRunner.query(`ROLLBACK TO SAVEPOINT postgis_probe`);
      }
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        `Geofence storage mode: PostGIS unavailable (${message}), falling back to JSONB bbox`,
      );
    }

    if (postgisAvailable) {
      console.warn('Geofence storage mode: postgis');
      // PostGIS path — real polygons, GIST index, ST_Contains query-friendly.
      await queryRunner.query(
        `ALTER TABLE "museums" ADD COLUMN IF NOT EXISTS "geofence" geometry(Polygon, 4326)`,
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "IDX_museums_geofence_gist" ON "museums" USING GIST ("geofence")`,
      );
    } else {
      console.warn('Geofence storage mode: jsonb-bbox');
      // Fallback path — rectangle bbox {north, south, east, west}, no index
      // (V1 < 100 museums, in-app containment check is fast enough).
      await queryRunner.query(
        `ALTER TABLE "museums" ADD COLUMN IF NOT EXISTS "geofence_bbox" jsonb`,
      );
    }
  }

  /**
   * Drops whichever column is present. The `postgis` extension stays
   * installed — future migrations may depend on it.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    // Introspect which mode was active so the revert is symmetric.
    const cols = (await queryRunner.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'museums' AND column_name IN ('geofence', 'geofence_bbox')`,
    )) as { column_name: string }[];
    const colSet = new Set(cols.map((row) => row.column_name));

    if (colSet.has('geofence')) {
      await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_museums_geofence_gist"`);
      await queryRunner.query(`ALTER TABLE "museums" DROP COLUMN IF EXISTS "geofence"`);
    }
    if (colSet.has('geofence_bbox')) {
      await queryRunner.query(`ALTER TABLE "museums" DROP COLUMN IF EXISTS "geofence_bbox"`);
    }
  }
}
