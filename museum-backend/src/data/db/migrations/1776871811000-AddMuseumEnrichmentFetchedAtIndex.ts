import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds a btree index on `museum_enrichment.fetchedAt` to support the daily
 * stale-enrichment scan (`RefreshStaleEnrichmentsUseCase`). Without this index,
 * the nightly `WHERE fetchedAt < :threshold ORDER BY fetchedAt ASC LIMIT 100`
 * query would degrade to a full table scan once the cache grows past a few
 * thousand rows.
 *
 * Handwritten (CLI-generated migration requires a live DB; docker-compose is
 * unavailable in this sandbox — same constraint applied to migration
 * 1776700000000).
 */
export class AddMuseumEnrichmentFetchedAtIndex1776871811000 implements MigrationInterface {
  name = 'AddMuseumEnrichmentFetchedAtIndex1776871811000';

  /** Apply the AddMuseumEnrichmentFetchedAtIndex migration. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IDX_museum_enrichment_fetchedAt" ON "museum_enrichment" ("fetchedAt")`,
    );
  }

  /** Revert the AddMuseumEnrichmentFetchedAtIndex migration. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_museum_enrichment_fetchedAt"`);
  }
}
