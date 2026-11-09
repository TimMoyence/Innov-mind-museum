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
    '<rootDir>/tests/unit/routes/admin-users-tier.route.test.ts',
  ],
});
