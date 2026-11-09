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
  extraTestPathIgnorePatterns: [
    '<rootDir>/tests/unit/routes/museum-enrichment.route.test.ts',
    '<rootDir>/tests/unit/shared/redis-cache-service.test.ts',
  ],
});

config.jest.enableFindRelatedTests = true;

export default config;
