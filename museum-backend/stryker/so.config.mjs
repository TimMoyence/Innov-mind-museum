import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: [
    'src/shared/security/**/*.ts',
    'src/shared/observability/**/*.ts',
    '!src/**/*.entity.ts',
    '!src/**/*.types.ts',
  ],
  allowEnvConcurrency: false,
});
