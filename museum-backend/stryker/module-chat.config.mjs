/**
 * module/chat scope — full chat module (155 mutable files, ~12k mutants).
 *
 * ⚠️ DO NOT RUN END-TO-END. The 2026-05-15 first-pass attempt produced
 * 1405 timeouts in 3778 tested mutants (37% timeout rate) at 6h elapsed
 * with a projected 4-day completion. Likely cause: some chat code paths
 * (image processing, embedding preprocessing, retry loops in
 * guardrails) produce mutant variants that hit Jest's default 5s
 * testTimeout, multiplying wall-clock cost. Carve-outs in the same
 * directory (module-chat-guardrails / module-chat-persistence /
 * module-chat-llm / module-chat-jobs) are the supported way to exercise
 * chat under Stryker. This file is kept as documentation of the full
 * scope and as a fallback for future incremental re-runs once the
 * carve-outs have raised the baseline coverage.
 *
 * Usage: prefer the carve-outs (see other stryker/module-chat-*.config.mjs).
 *
 * `setupFiles` pins `EXTRACTION_WORKER_ENABLED=false` for the sandbox to
 * avoid the BullMQ/ioredis TCP handle leak that masks real kills as Timeout
 * under Stryker's mandatory `forceExit:false`. Mirrors module-admin
 * (see tests/helpers/chat/jest-env.setup.ts header for the full story).
 * `extraTestPathIgnorePatterns` matches the admin scope exclusion list —
 * both files cover zero `src/modules/chat/**` mutant (perTest coverage
 * would skip them anyway) but they boot infra clients that leak open
 * ioredis TCP handles into the shared worker process and break the
 * `forceExit:false` cleanup between mutants.
 */
import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: ['src/modules/chat/**/*.ts', '!src/**/*.entity.ts', '!src/**/*.types.ts'],
  setupFiles: ['<rootDir>/tests/helpers/chat/jest-env.setup.ts'],
  extraTestPathIgnorePatterns: [
    '<rootDir>/tests/unit/routes/museum-enrichment.route.test.ts',
    '<rootDir>/tests/unit/shared/redis-cache-service.test.ts',
  ],
});
