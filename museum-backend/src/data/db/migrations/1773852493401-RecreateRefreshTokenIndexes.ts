import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 *
 */
export class RecreateRefreshTokenIndexes1773852493401 implements MigrationInterface {
  name = 'RecreateRefreshTokenIndexes1773852493401';

  /** Apply the RecreateRefreshTokenIndexes migration. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_refresh_token_user" ON "auth_refresh_tokens" ("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_refresh_token_family" ON "auth_refresh_tokens" ("familyId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_refresh_token_expires" ON "auth_refresh_tokens" ("expiresAt")`,
    );
  }

  /** Revert the RecreateRefreshTokenIndexes migration. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_refresh_token_expires"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_refresh_token_family"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_refresh_token_user"`);
  }
}
