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
 */
import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: [
    'src/modules/chat/jobs/**/*.ts',
    '!src/**/*.entity.ts',
    '!src/**/*.types.ts',
  ],
});
