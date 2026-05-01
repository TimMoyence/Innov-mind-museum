import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A2 — P1 simple foreign-key and partial token indexes (zero-downtime
 * CONCURRENTLY). Body authored in T8. This shell locks the timestamp
 * prefix so subsequent tasks can refer to it.
 *
 * Spec: docs/superpowers/specs/2026-04-30-A1-A2-critical-fk-indexes-design.md
 */
export class AddP1FKAndTokenIndexes1777617893834 implements MigrationInterface {
  name = 'AddP1FKAndTokenIndexes1777617893834';
  public readonly transaction = false as const;

  /**
   * Build the P1 FK + token indexes concurrently. SQL body added in T8.
   *
   * @param _queryRunner TypeORM query runner injected by the migration executor.
   */
  public async up(_queryRunner: QueryRunner): Promise<void> {
    // Body added in T8 — indexes authored after shell is committed.
  }

  /**
   * Drop the P1 indexes in reverse order. SQL body added in T8.
   *
   * @param _queryRunner TypeORM query runner injected by the migration executor.
   */
  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Body added in T8 — indexes dropped in reverse order.
  }
}
