import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: [
    'src/modules/auth/**/*.ts',
    'src/shared/security/**/*.ts',
    'src/shared/audit/**/*.ts',
    'src/shared/observability/**/*.ts',
    '!src/**/*.entity.ts',
    '!src/**/*.migration.ts',
    '!src/**/*.d.ts',
    '!src/**/*.types.ts',
    '!src/data/db/migrations/**',
  ],
  allowEnvConcurrency: false,
});
