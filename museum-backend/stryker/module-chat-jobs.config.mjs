/**
 * module/chat carve-out — retention + cleanup cron jobs.
 *
 * 5 files: chat-purge, chat-media-purger, art-keywords-retention-cron,
 * chat-purge-cron registrar, s3-orphan-purge. All idempotent retention
 * passes that follow the audit-cron-registrar pattern (cached at 0 surv
 * in 171efdd4).
 *
 * Smallest carve-out — pick this first as a sanity check before the
 * larger guardrails / llm / persistence scopes.
 *
 * Usage: `pnpm stryker run stryker/module-chat-jobs.config.mjs`
 *
 * `setupFiles` pins `EXTRACTION_WORKER_ENABLED=false` for the sandbox to
 * avoid the BullMQ/ioredis TCP handle leak that masks real kills as Timeout
 * under Stryker's mandatory `forceExit:false`. This is the highest-value
 * scope for the pin per the audit-360 2026-05-16 baseline (chat-media-purger
 * 65/0, chat-purge 72/1, s3-orphan-purge 75/5). See
 * tests/helpers/chat/jest-env.setup.ts header for the full story.
 * `extraTestPathIgnorePatterns` matches the admin scope exclusion list —
 * both files cover zero `src/modules/chat/jobs/**` mutant (perTest coverage
 * would skip them anyway) but they boot infra clients that leak open
 * ioredis TCP handles into the shared worker process and break the
 * `forceExit:false` cleanup between mutants.
 */
import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: ['src/modules/chat/jobs/**/*.ts', '!src/**/*.entity.ts', '!src/**/*.types.ts'],
  setupFiles: ['<rootDir>/tests/helpers/chat/jest-env.setup.ts'],
  extraTestPathIgnorePatterns: [
    '<rootDir>/tests/unit/routes/museum-enrichment.route.test.ts',
    '<rootDir>/tests/unit/shared/redis-cache-service.test.ts',
  ],
  // 5302-test dry-run exceeds Stryker's 5min default on contended runners
  // (audit-360 S3 Phase 4 timed out 4x: 5min default + 15min retry under
  // STRYKER_CONCURRENCY=1). Bump to 15min for headroom — pure timeout knob,
  // does not change mutation logic or sandboxing.
  dryRunTimeoutMinutes: 15,
});
