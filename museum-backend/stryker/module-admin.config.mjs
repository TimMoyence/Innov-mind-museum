import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: ['src/modules/admin/**/*.ts', '!src/**/*.entity.ts', '!src/**/*.types.ts'],
  setupFiles: ['<rootDir>/tests/helpers/admin/jest-env.setup.ts'],
  extraTestPathIgnorePatterns: [
    '<rootDir>/tests/unit/routes/museum-enrichment.route.test.ts',
    '<rootDir>/tests/unit/shared/redis-cache-service.test.ts',
  ],
});
