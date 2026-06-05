import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * PR-P0-1 (2026-05-23) — Add `chat_messages.cache_key` (LAUNCH-BLOCKER).
 *
 * Carries the exact Redis key (`llm:v2:{contextClass}:{museumId|none}:{userId|anon}:{sha256}`)
 * stamped by `LlmCacheServiceImpl.store()` at assistant-message write time, so
 * `ChatMediaService.invalidateCacheForFeedback` can purge the exact cached
 * entry on negative feedback — replacing the broken `chat:llm:*` cartesian
 * which targeted 0 real keys (the production cache lives under `llm:v2:*`).
 *
 * Closes the sweep started by I-FIX1 (2026-05-21 admin purge fix —
 * `cache-purge.route.ts:14-31`); the feedback path was missed in that same
 * sweep.
 *
 * Shape :
 *   - `cache_key text NULL` (no default, no backfill).
 *   - Pre-migration rows keep NULL forever — R4 skip-when-null contract
 *     handles them (legacy rows TTL out within ≤ 7 d).
 *   - Pure `ADD COLUMN` is metadata-only on Postgres 11+ (no rewrite) —
 *     idempotent at the row-data level, instant on populated tables.
 *   - No `SAVEPOINT` — safe under integration harness
 *     `runMigrations({ transaction: 'none' })` (CLAUDE.md gotcha).
 *   - Internal-only column (NFR-2) — never exposed via API responses.
 *
 * Body authored by hand (per `docs/MIGRATION_GOVERNANCE.md` §6 — isolating
 * the intentional diff from any pre-existing baseline drift; the dev DB
 * was not booted at generation time, so the CLI `generate` step was not
 * runnable — same approach as T-B7 / T-B8 / T-A7).
 *
 * Spec : `team-state/2026-05-23-pr-p0-1-fix-llm-cache-feedback/spec.md`
 *        R5 + R6 + AC1 + AC11 ; design.md §2.1#2 + §3.3 ; tasks.md T1.
 */
export class AddCacheKeyToChatMessages1779536483274 implements MigrationInterface {
  name = 'AddCacheKeyToChatMessages1779536483274';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "chat_messages" ADD "cache_key" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "chat_messages" DROP COLUMN IF EXISTS "cache_key"`);
  }
}
