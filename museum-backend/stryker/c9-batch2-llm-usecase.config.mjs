/**
 * C9 batch 2 — useCase/llm files touched by C9.5/C9.17.
 *
 * Batch strategy adopted after llm-scope full (~25 files) hung 3h11 with
 * 0 output. Sanity 1-file (llm-judge-guardrail.ts, batch 1) completed
 * in 10:49 with 84.87% mutation score → Stryker works on small scope.
 *
 * This batch mutates 3 files I touched in C9.5/C9.17:
 *   - llm-prompt-builder.ts (C9.5 — reorder buildSectionMessages)
 *   - llm-sections.ts (C9.17 — drop legacy [META] emit branch)
 *   - llm-sections/main-assistant-output.schema.ts (C9.17 — added sources)
 *
 * Same sandbox setup as module-chat-llm.config.mjs.
 */
import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: [
    'src/modules/chat/useCase/llm/llm-prompt-builder.ts',
    'src/modules/chat/useCase/llm/llm-sections.ts',
    'src/modules/chat/useCase/llm/llm-sections/main-assistant-output.schema.ts',
  ],
  setupFiles: ['<rootDir>/tests/helpers/chat/jest-env.setup.ts'],
  extraTestPathIgnorePatterns: [
    '<rootDir>/tests/unit/routes/museum-enrichment.route.test.ts',
    '<rootDir>/tests/unit/shared/redis-cache-service.test.ts',
    // 2026-05-18 — pre-existing flake (socket hang up on dry-run baseline).
    // Out of C9.5/17 mutation scope; exclude so the dry-run completes.
    '<rootDir>/tests/unit/routes/admin-users-tier.route.test.ts',
  ],
});
