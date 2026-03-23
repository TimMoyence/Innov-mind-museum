import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuditLogsTable1774200100000 implements MigrationInterface {
  name = 'CreateAuditLogsTable1774200100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "audit_logs" (
        "id"          UUID         NOT NULL DEFAULT gen_random_uuid(),
        "action"      VARCHAR(64)  NOT NULL,
        "actor_type"  VARCHAR(16)  NOT NULL,
        "actor_id"    INTEGER,
        "target_type" VARCHAR(64),
        "target_id"   VARCHAR(255),
        "metadata"    JSONB,
        "ip"          INET,
        "request_id"  UUID,
        "created_at"  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_audit_logs" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_actor_id" ON "audit_logs" ("actor_id") WHERE "actor_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_action" ON "audit_logs" ("action")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_target" ON "audit_logs" ("target_type", "target_id") WHERE "target_type" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_created_at" ON "audit_logs" ("created_at" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_actor_time" ON "audit_logs" ("actor_id", "created_at" DESC) WHERE "actor_id" IS NOT NULL`,
    );

    // Immutability enforcement — prevent UPDATE and DELETE at the database level
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
      RETURNS TRIGGER AS $$
      BEGIN
        RAISE EXCEPTION 'audit_logs table is immutable: % operations are forbidden', TG_OP;
      END;
      $$ LANGUAGE plpgsql
    `);

    await queryRunner.query(`
      CREATE TRIGGER trg_audit_logs_no_update
        BEFORE UPDATE ON "audit_logs"
        FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation()
    `);

    await queryRunner.query(`
      CREATE TRIGGER trg_audit_logs_no_delete
        BEFORE DELETE ON "audit_logs"
        FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_audit_logs_no_delete ON "audit_logs"`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_audit_logs_no_update ON "audit_logs"`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS prevent_audit_log_mutation()`);
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_logs"`);
  }
}
