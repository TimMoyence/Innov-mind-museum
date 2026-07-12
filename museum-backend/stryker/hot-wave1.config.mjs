/**
 * Hot-files coverage RAMP — wave 1 (2026-07-12).
 *
 * Mutates 4 additional security/business-critical files being promoted into
 * `.stryker-hot-files.json`. Same mechanics as hot-2files.config.mjs:
 *   - `enableFindRelatedTests: true` so only the tests importing each mutated
 *     file run (side-steps the ~57 meta/sentinel tests that fs-read source or
 *     spawn CLI scripts and ENOENT in Stryker's sandbox).
 *   - both env setupFiles (PGDATABASE pin + chat EXTRACTION_WORKER/CACHE off).
 *   - the 2 module-config excludes for the BullMQ/ioredis-leaking route/cache
 *     tests findRelatedTests pulls in transitively.
 *
 * config.mjs's `incremental: true` accumulates reports/stryker-incremental.json
 * across waves, keeping subsequent runs cheap.
 */
import { defineConfig } from './config.mjs';

const config = defineConfig({
  mutate: [
    'src/modules/auth/useCase/session/token-jwt.service.ts',
    'src/modules/chat/useCase/guardrail/guardrail-evaluation.service.ts',
    'src/modules/chat/adapters/secondary/guardrails/llm-guard.adapter.ts',
    'src/modules/chat/useCase/llm/llm-judge-guardrail.ts',
  ],
  setupFiles: [
    '<rootDir>/tests/helpers/jest-env-pgdatabase.setup.ts',
    '<rootDir>/tests/helpers/chat/jest-env.setup.ts',
  ],
  extraTestPathIgnorePatterns: [
    '<rootDir>/tests/unit/routes/museum-enrichment.route.test.ts',
    '<rootDir>/tests/unit/shared/redis-cache-service.test.ts',
  ],
});

config.jest.enableFindRelatedTests = true;

export default config;
