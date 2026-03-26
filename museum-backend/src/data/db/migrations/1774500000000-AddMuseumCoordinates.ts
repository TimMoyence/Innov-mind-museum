import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 *
 */
export class AddMuseumCoordinates1774500000000 implements MigrationInterface {
  name = 'AddMuseumCoordinates1774500000000';

  /** Apply the AddMuseumCoordinates migration. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "museums" ADD COLUMN "latitude" DOUBLE PRECISION`,
    );
    await queryRunner.query(
      `ALTER TABLE "museums" ADD COLUMN "longitude" DOUBLE PRECISION`,
    );
  }

  /** Revert the AddMuseumCoordinates migration. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "museums" DROP COLUMN IF EXISTS "longitude"`,
    );
    await queryRunner.query(
      `ALTER TABLE "museums" DROP COLUMN IF EXISTS "latitude"`,
    );
  }
}
