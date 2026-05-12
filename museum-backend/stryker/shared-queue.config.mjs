/**
 * shared/queue scope — scheduled-jobs only (job-failure.handler.ts has no direct
 * test → moved to no-test backlog, excluded from this scope to avoid drowning
 * the score with NoCoverage mutants).
 *
 * Usage : `pnpm stryker run stryker/shared-queue.config.mjs`
 * Optional: `STRYKER_CONCURRENCY=2 pnpm stryker run …` (default 8 local / 4 CI).
 */
import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: ['src/shared/queue/scheduled-jobs.ts', '!src/**/*.entity.ts', '!src/**/*.types.ts'],
});
