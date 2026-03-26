import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 *
 */
export class AddAuthRefreshTokens1771800000000 implements MigrationInterface {
  name = 'AddAuthRefreshTokens1771800000000';

  /** Apply the AddAuthRefreshTokens migration. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "auth_refresh_tokens" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "jti" uuid NOT NULL,
        "familyId" uuid NOT NULL,
        "tokenHash" character varying(128) NOT NULL,
        "issuedAt" TIMESTAMP NOT NULL,
        "expiresAt" TIMESTAMP NOT NULL,
        "rotatedAt" TIMESTAMP,
        "revokedAt" TIMESTAMP,
        "reuseDetectedAt" TIMESTAMP,
        "replacedByTokenId" uuid,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "userId" integer NOT NULL,
        CONSTRAINT "UQ_auth_refresh_tokens_jti" UNIQUE ("jti"),
        CONSTRAINT "PK_auth_refresh_tokens_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_auth_refresh_tokens_userId" ON "auth_refresh_tokens" ("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_auth_refresh_tokens_familyId" ON "auth_refresh_tokens" ("familyId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_auth_refresh_tokens_expiresAt" ON "auth_refresh_tokens" ("expiresAt")`,
    );
    await queryRunner.query(`
      ALTER TABLE "auth_refresh_tokens"
      ADD CONSTRAINT "FK_auth_refresh_tokens_user"
      FOREIGN KEY ("userId") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  /** Revert the AddAuthRefreshTokens migration. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "auth_refresh_tokens" DROP CONSTRAINT "FK_auth_refresh_tokens_user"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_auth_refresh_tokens_expiresAt"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_auth_refresh_tokens_familyId"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_auth_refresh_tokens_userId"`);
    await queryRunner.query(`DROP TABLE "auth_refresh_tokens"`);
  }
}

