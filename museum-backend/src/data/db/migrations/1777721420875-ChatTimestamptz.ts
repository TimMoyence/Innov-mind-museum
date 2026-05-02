import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 10 Bug 1 fix — convert chat timestamp columns from
 * `TIMESTAMP WITHOUT TIME ZONE` to `TIMESTAMP WITH TIME ZONE`.
 *
 * Why:
 *   The cursor-pagination paths (`listSessionMessages`,`listSessions`)
 *   encode `last.createdAt.toISOString()` (UTC `Z`) and bind a JS `Date`
 *   to the parameter. Against a `TIMESTAMP WITHOUT TIME ZONE` column
 *   PostgreSQL coerces the bound timestamp through the connection
 *   `TimeZone` GUC. On a non-UTC host (`TZ=Europe/Paris`, `TZ=America/
 *   New_York`) the comparison `< :cursorDate` returns empty pages
 *   silently. CI runs UTC so production is asymptomatic; local dev
 *   was broken — and any future host TZ drift would surface in prod.
 *
 *   `TIMESTAMP WITH TIME ZONE` (a.k.a. `TIMESTAMPTZ`) stores all
 *   values normalised to UTC under the hood, so JS `Date` parameter
 *   binding is timezone-stable end-to-end.
 *
 * Data-preserving conversion:
 *   `ALTER COLUMN ... TYPE TIMESTAMPTZ USING <col> AT TIME ZONE 'UTC'`
 *   reinterprets each existing naive timestamp as UTC, which matches
 *   what the application has been doing implicitly (Node's
 *   `new Date()` always emits a UTC-equivalent epoch when serialised
 *   to a `TIMESTAMP WITHOUT TIME ZONE` via TypeORM). No back-fill,
 *   no data loss.
 *
 * Rollback:
 *   The `down()` migration reverses the type change with
 *   `... USING <col> AT TIME ZONE 'UTC'`, recovering the prior
 *   semantics. Already-rotated cursor consumers will not break:
 *   the row values themselves are unchanged at the bytes level.
 */
export class ChatTimestamptz1777721420875 implements MigrationInterface {
  name = 'ChatTimestamptz1777721420875';

  /**
   * Reinterpret existing chat timestamp values as UTC and re-type the
   * columns to `TIMESTAMP WITH TIME ZONE`. Idempotent at the byte level —
   * existing rows are preserved.
   */
  public async up(queryRunner: QueryRunner): Promise<void> {
    // chat_sessions: createdAt + updatedAt (cursor key) + purged_at.
    await queryRunner.query(
      `ALTER TABLE "chat_sessions" ALTER COLUMN "createdAt" TYPE TIMESTAMP WITH TIME ZONE USING "createdAt" AT TIME ZONE 'UTC'`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_sessions" ALTER COLUMN "updatedAt" TYPE TIMESTAMP WITH TIME ZONE USING "updatedAt" AT TIME ZONE 'UTC'`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_sessions" ALTER COLUMN "purged_at" TYPE TIMESTAMP WITH TIME ZONE USING "purged_at" AT TIME ZONE 'UTC'`,
    );

    // chat_messages: createdAt (cursor key) + audioGeneratedAt.
    await queryRunner.query(
      `ALTER TABLE "chat_messages" ALTER COLUMN "createdAt" TYPE TIMESTAMP WITH TIME ZONE USING "createdAt" AT TIME ZONE 'UTC'`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_messages" ALTER COLUMN "audioGeneratedAt" TYPE TIMESTAMP WITH TIME ZONE USING "audioGeneratedAt" AT TIME ZONE 'UTC'`,
    );
  }

  /**
   * Reverse the type change with the same `USING <col> AT TIME ZONE 'UTC'`
   * pattern — the row bytes themselves are unchanged, only the column type
   * declaration moves back to the prior naive form.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "chat_messages" ALTER COLUMN "audioGeneratedAt" TYPE TIMESTAMP WITHOUT TIME ZONE USING "audioGeneratedAt" AT TIME ZONE 'UTC'`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_messages" ALTER COLUMN "createdAt" TYPE TIMESTAMP WITHOUT TIME ZONE USING "createdAt" AT TIME ZONE 'UTC'`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_sessions" ALTER COLUMN "purged_at" TYPE TIMESTAMP WITHOUT TIME ZONE USING "purged_at" AT TIME ZONE 'UTC'`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_sessions" ALTER COLUMN "updatedAt" TYPE TIMESTAMP WITHOUT TIME ZONE USING "updatedAt" AT TIME ZONE 'UTC'`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_sessions" ALTER COLUMN "createdAt" TYPE TIMESTAMP WITHOUT TIME ZONE USING "createdAt" AT TIME ZONE 'UTC'`,
    );
  }
}
