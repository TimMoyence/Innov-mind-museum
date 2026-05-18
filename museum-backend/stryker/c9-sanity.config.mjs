/**
 * C9 sanity-scope — single file mutation, smoke-test that Stryker can produce
 * an output at all. After the llm-scope run hung for 3h11 with empty stdout
 * and no `reports/mutation/` written, we narrow to ONE file to verify the
 * pipeline works before reattempting the full scope.
 *
 * Target: `llm-judge-guardrail.ts` — small, well-tested, the C9.7 detached
 * judge module. ~50-100 mutants expected; should finish in 5-10 min.
 *
 * Mirrors module-chat-llm.config.mjs sandbox setup (BullMQ/ioredis env pin +
 * test-path exclusions) to keep `forceExit:false` clean.
 */
import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: ['src/modules/chat/useCase/llm/llm-judge-guardrail.ts'],
  setupFiles: ['<rootDir>/tests/helpers/chat/jest-env.setup.ts'],
  extraTestPathIgnorePatterns: [
    '<rootDir>/tests/unit/routes/museum-enrichment.route.test.ts',
    '<rootDir>/tests/unit/shared/redis-cache-service.test.ts',
  ],
});
