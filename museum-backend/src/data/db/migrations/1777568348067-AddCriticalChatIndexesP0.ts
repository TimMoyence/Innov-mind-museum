import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A1 — P0 critical FK indexes for chat hot-path (scale hardening).
 *
 * Body authored in T2. This shell locks the timestamp prefix used by
 * the class name so downstream tasks can reference it deterministically.
 *
 * Spec: docs/superpowers/specs/2026-04-30-A1-A2-critical-fk-indexes-design.md
 */
export class AddCriticalChatIndexesP01777568348067 implements MigrationInterface {
  name = 'AddCriticalChatIndexesP01777568348067';

  /**
   * Create P0 chat FK indexes. SQL body added in T2.
   *
   * @param _queryRunner TypeORM query runner injected by the migration executor.
   */
  public async up(_queryRunner: QueryRunner): Promise<void> {
    // Body added in T2 — indexes authored after shell is committed.
  }

  /**
   * Drop P0 chat FK indexes. SQL body added in T2.
   *
   * @param _queryRunner TypeORM query runner injected by the migration executor.
   */
  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Body added in T2 — indexes dropped in reverse order.
  }
}
