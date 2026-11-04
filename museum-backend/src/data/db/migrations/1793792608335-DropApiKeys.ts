import type { MigrationInterface, QueryRunner } from 'typeorm';

export class DropApiKeys1793792608335 implements MigrationInterface {
  name = 'DropApiKeys1793792608335';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "api_keys"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "api_keys" ("id" SERIAL NOT NULL, "prefix" character varying(8) NOT NULL, "hash" character varying NOT NULL, "salt" character varying(64) NOT NULL, "name" character varying(100) NOT NULL, "user_id" integer NOT NULL, "expires_at" TIMESTAMP, "last_used_at" TIMESTAMP, "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "museum_id" integer, CONSTRAINT "UQ_6f6105c8efe05b310d046cbdb3d" UNIQUE ("prefix"), CONSTRAINT "PK_5c8a79801b44bd27b79228e1dad" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "api_keys" ADD CONSTRAINT "FK_a3baee01d8408cd3c0f89a9a973" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_api_keys_user_id" ON "api_keys" ("user_id")`);
  }
}
