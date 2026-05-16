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
 */
import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: [
    'src/modules/chat/**/*.ts',
    '!src/**/*.entity.ts',
    '!src/**/*.types.ts',
  ],
});
