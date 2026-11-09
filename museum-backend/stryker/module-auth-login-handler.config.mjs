import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: ['src/modules/auth/adapters/primary/http/helpers/login-handler.helpers.ts'],
  setupFiles: ['<rootDir>/tests/helpers/auth/jest-env.setup.ts'],
  extraTestPathIgnorePatterns: [
    '<rootDir>/tests/unit/routes/museum-enrichment.route.test.ts',
    '<rootDir>/tests/unit/shared/redis-cache-service.test.ts',
  ],
});
