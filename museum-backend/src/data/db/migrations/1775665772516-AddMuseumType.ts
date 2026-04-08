import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 *
 */
export class AddMuseumType1775665772516 implements MigrationInterface {
  name = 'AddMuseumType1775665772516';

  /** Adds the museumType column with a default of 'general' for existing rows. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "museums" ADD "museumType" character varying(32) NOT NULL DEFAULT 'general'`,
    );
  }

  /** Drops the museumType column. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "museums" DROP COLUMN "museumType"`);
  }
}
