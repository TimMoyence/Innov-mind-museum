import { defineConfig } from './config.mjs';

const config = defineConfig({
  mutate: [
    'src/modules/auth/useCase/session/token-jwt.service.ts',
    'src/modules/chat/useCase/guardrail/guardrail-evaluation.service.ts',
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
