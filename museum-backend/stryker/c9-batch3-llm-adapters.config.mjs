import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: [
    'src/modules/chat/adapters/secondary/llm/langchain.orchestrator.ts',
    'src/modules/chat/adapters/secondary/llm/langchain-orchestrator-assembly.ts',
    'src/modules/chat/adapters/secondary/llm/langchain-orchestrator-support.ts',
  ],
  setupFiles: ['<rootDir>/tests/helpers/chat/jest-env.setup.ts'],
  extraTestPathIgnorePatterns: [
    '<rootDir>/tests/unit/shared/redis-cache-service.test.ts',
    '<rootDir>/tests/unit/routes/',
  ],
});
