/**
 * Hot-files coverage — completes the 2 files missing from the last full report
 * (art-topic-guardrail + llm-circuit-breaker) so `mutation:gate` is 8/8.
 *
 * `enableFindRelatedTests: true`: Stryker runs `jest --findRelatedTests <mutated
 * file>`, so only the tests importing the mutated source run — this side-steps
 * the ~57 meta/sentinel tests that fs-read source files or spawn CLI scripts by
 * path (they ENOENT in Stryker's `.stryker-tmp` sandbox and abort the dry run).
 * Kills come from the full covering set (unit + integration), which is why they
 * land as Timeout under `forceExit:false` — real kills, per the project's gate
 * formula (Timeout counts as killed). See TD-MUT-RAMP-100 for the speed debt
 * (unit tests alone leave ~50% survivors; coverage relies on the slower tests).
 *
 * `setupFiles` REPLACES the project's setupFiles → include BOTH the base
 * PGDATABASE pin AND the chat env pin (EXTRACTION_WORKER/CACHE off).
 */
import { defineConfig } from './config.mjs';

const config = defineConfig({
  mutate: [
    'src/modules/chat/useCase/guardrail/art-topic-guardrail.ts',
    'src/modules/chat/adapters/secondary/llm/llm-circuit-breaker.ts',
  ],
  setupFiles: [
    '<rootDir>/tests/helpers/jest-env-pgdatabase.setup.ts',
    '<rootDir>/tests/helpers/chat/jest-env.setup.ts',
  ],
  // findRelatedTests pulls these in transitively; they eagerly boot BullMQ/
  // ioredis clients and cover no guardrail/circuit-breaker mutant.
  extraTestPathIgnorePatterns: [
    '<rootDir>/tests/unit/routes/museum-enrichment.route.test.ts',
    '<rootDir>/tests/unit/shared/redis-cache-service.test.ts',
  ],
});

config.jest.enableFindRelatedTests = true;

export default config;
