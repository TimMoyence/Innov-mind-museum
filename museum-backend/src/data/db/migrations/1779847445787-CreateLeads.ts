import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cycle B (« Aucun lead perdu ») — create the `leads` table so a B2B / beta /
 * paywall lead is persisted BEFORE the Brevo notifier is invoked, surviving a
 * Brevo runtime failure (spec R4, design §4).
 *
 * Generated via `node scripts/migration-cli.cjs generate --name=CreateLeads`
 * against a clean schema (all prior migrations applied). The generator also
 * surfaced PRE-EXISTING entity↔migration drift unrelated to leads (FK constraint
 * renames, totp UNIQUE, artwork_embeddings halfvec↔text, index renames) — those
 * statements were stripped: this migration touches ONLY the new `leads` table
 * (Migration Governance / UFR-013 — never bundle unrelated schema changes).
 *
 * The jsonb expression index `IDX_leads_payload_email` on
 * `(LOWER(payload->>'email'))` backs `ILeadRepository.deleteByEmail` (R20). It
 * is NOT expressible from the TypeORM `@Index` decorator (expression index over
 * a jsonb path), so it is added here by hand and dropped in `down()`.
 */
export class CreateLeads1779847445787 implements MigrationInterface {
  name = 'CreateLeads1779847445787';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "leads" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "type" character varying(16) NOT NULL, "status" character varying(16) NOT NULL DEFAULT 'pending', "payload" jsonb NOT NULL, "dedupKey" character varying(80), "attempts" integer NOT NULL DEFAULT '0', "lastError" text, "nextEligibleAt" TIMESTAMP WITH TIME ZONE, "deliveredAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_cd102ed7a9a4ca7d4d8bfeba406" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_leads_delivered_at" ON "leads" ("deliveredAt") WHERE "status" = 'delivered'`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_leads_dedup_key" ON "leads" ("dedupKey") WHERE "dedupKey" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_leads_redeliverable" ON "leads" ("status", "attempts") WHERE "status" IN ('pending', 'failed')`,
    );
    // R20 — jsonb expression index for deleteByEmail (GDPR Art.17 erasure by
    // normalised email). Not generatable from the @Index decorator.
    await queryRunner.query(
      `CREATE INDEX "IDX_leads_payload_email" ON "leads" ((LOWER(payload->>'email')))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_leads_payload_email"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_leads_redeliverable"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_leads_dedup_key"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_leads_delivered_at"`);
    await queryRunner.query(`DROP TABLE "leads"`);
  }
}
