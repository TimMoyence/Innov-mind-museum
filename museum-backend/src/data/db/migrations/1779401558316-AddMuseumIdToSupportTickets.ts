import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * T-B8 — Add `support_tickets.museum_id` (Wave B C7 / M3).
 *
 * B2B multi-tenant scope for support tickets. Threaded through createTicket /
 * listTickets so a museum operator only ever sees their own tenant's tickets
 * (OWASP API3 / BOLA guard).
 *
 * Shape :
 *   - `museum_id integer NULL` FK → `museums.id` (integer PK).
 *   - Nullable so existing tickets (pre-multi-tenant) survive the migration
 *     without backfill — admin UI backfills museum_id later.
 *   - `ON DELETE SET NULL` — ticket survives tenant offboarding as an
 *     un-scoped row (operator decides whether to delete it explicitly).
 *   - Partial index `IDX_support_tickets_museum_id` (where museum_id IS NOT
 *     NULL) — mirrors sibling `IDX_support_tickets_assigned_to` pattern.
 *
 * Body authored by hand (per `docs/MIGRATION_GOVERNANCE.md` §6 — isolating
 * the intentional diff from pre-existing baseline drift, same approach as
 * T-B7 / T-A7).
 *
 * Spec : `team-state/2026-05-21-p0-feature-gates/spec.md` R-C7a + R-C7c +
 *         design.md §4 M3 + tasks.md T-B8.
 */
export class AddMuseumIdToSupportTickets1779401558316 implements MigrationInterface {
  name = 'AddMuseumIdToSupportTickets1779401558316';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "support_tickets" ADD COLUMN "museum_id" integer NULL`);
    await queryRunner.query(
      `ALTER TABLE "support_tickets"
         ADD CONSTRAINT "FK_support_tickets_museum_id"
         FOREIGN KEY ("museum_id") REFERENCES "museums"("id")
         ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_support_tickets_museum_id" ON "support_tickets" ("museum_id") WHERE "museum_id" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_support_tickets_museum_id"`);
    await queryRunner.query(
      `ALTER TABLE "support_tickets" DROP CONSTRAINT IF EXISTS "FK_support_tickets_museum_id"`,
    );
    await queryRunner.query(`ALTER TABLE "support_tickets" DROP COLUMN IF EXISTS "museum_id"`);
  }
}
