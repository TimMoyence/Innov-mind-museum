import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: [
    'src/modules/auth/**/*.ts',
    '!src/**/*.entity.ts',
    '!src/**/*.types.ts',
    '!src/**/*.migration.ts',
  ],
  allowEnvConcurrency: false,
});
