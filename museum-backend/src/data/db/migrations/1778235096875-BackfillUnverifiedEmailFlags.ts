import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Data backfill — flips `email_verified=true` for accounts that registered
 * before the verification email rollout was reliably wired but never
 * completed verification (no token, or token already consumed/expired).
 *
 * Context (incident 2026-05-08): the AddEmailVerification migration
 * (1773939685275) added `email_verified BOOLEAN NOT NULL DEFAULT false` with
 * no backfill. Five legitimate pre-launch accounts created between
 * 2026-03-23 and 2026-04-19 were stuck unable to sign in (403
 * EMAIL_NOT_VERIFIED on /api/auth/login) because the verification email
 * either never reached them or was ignored.
 *
 * App is pre-launch (target 2026-06-01), no public registration funnel yet,
 * so the entire `email_verified=false` cohort is internal/test users we
 * trust. We flip the whole cohort once and clear any stale verification
 * tokens to avoid reuse via the verify-email endpoint after the fact.
 *
 * Idempotent: safe to re-run — no-op when every row is already verified.
 *
 * Down migration intentionally a no-op. Reverting this would re-lock real
 * users out of their accounts; if rollback is ever required, a fresh
 * targeted UPDATE is the right tool, not a blanket revert.
 */
export class BackfillUnverifiedEmailFlags1778235096875 implements MigrationInterface {
  name = 'BackfillUnverifiedEmailFlags1778235096875';

  /** Apply the BackfillUnverifiedEmailFlags migration. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "users"
          SET "email_verified" = true,
              "verification_token" = NULL,
              "verification_token_expires" = NULL
        WHERE "email_verified" = false`,
    );
  }

  /**
   * Revert is intentionally unsafe — once `up()` runs, we no longer know which
   * rows started as `email_verified=false`, so a generic re-flip would either
   * re-lock real users out or be a no-op. Operators who genuinely need to
   * roll back must write a targeted per-user UPDATE in psql against the
   * specific accounts they want to revert.
   */
  public async down(_queryRunner: QueryRunner): Promise<void> {
    // `await` keeps the runtime async (Migration runner expects a Promise) and
    // satisfies @typescript-eslint/require-await without contorting the signature.
    await Promise.resolve();
    throw new Error(
      'BackfillUnverifiedEmailFlags1778235096875 is intentionally non-revertible. ' +
        'Reverting would re-lock real users out of their accounts. ' +
        'If a targeted rollback is required, write a per-user UPDATE in psql ' +
        'against the specific rows you want to flip back.',
    );
  }
}
