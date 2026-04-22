import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds hybrid-enrichment columns to `museum_enrichment` for the P3 per-locale
 * enrichment flow (Wikidata + Wikipedia + OSM opening-hours):
 *
 *   - `summary`       : short text summary (Wikipedia extract / Wikidata description)
 *   - `wikidataQid`   : canonical Wikidata entity id (e.g. `Q19675`)
 *   - `phone`         : primary phone (Wikidata P1329)
 *   - `imageUrl`      : Commons image URL (Wikidata P18)
 *   - `fetchedAt`     : last successful remote fetch — drives the 30-day
 *                       freshness window in `EnrichMuseumUseCase`.
 *
 * Handwritten (CLI-generated migration requires a live DB; docker-compose is
 * unavailable in this sandbox — see Discovery note).
 * Zero-downtime: all ADD COLUMNs are nullable or default-backed.
 */
export class AlterMuseumEnrichmentAddHybridFields1776700000000 implements MigrationInterface {
  name = 'AlterMuseumEnrichmentAddHybridFields1776700000000';

  /** Apply the AlterMuseumEnrichmentAddHybridFields migration. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "museum_enrichment" ADD "summary" text`);
    await queryRunner.query(
      `ALTER TABLE "museum_enrichment" ADD "wikidataQid" character varying(32)`,
    );
    await queryRunner.query(`ALTER TABLE "museum_enrichment" ADD "phone" character varying(32)`);
    await queryRunner.query(
      `ALTER TABLE "museum_enrichment" ADD "imageUrl" character varying(500)`,
    );
    await queryRunner.query(
      `ALTER TABLE "museum_enrichment" ADD "fetchedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()`,
    );
  }

  /** Revert the AlterMuseumEnrichmentAddHybridFields migration. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "museum_enrichment" DROP COLUMN "fetchedAt"`);
    await queryRunner.query(`ALTER TABLE "museum_enrichment" DROP COLUMN "imageUrl"`);
    await queryRunner.query(`ALTER TABLE "museum_enrichment" DROP COLUMN "phone"`);
    await queryRunner.query(`ALTER TABLE "museum_enrichment" DROP COLUMN "wikidataQid"`);
    await queryRunner.query(`ALTER TABLE "museum_enrichment" DROP COLUMN "summary"`);
  }
}
