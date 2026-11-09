import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: ['src/shared/audit/**/*.ts', '!src/**/*.entity.ts', '!src/**/*.types.ts'],
  allowEnvConcurrency: false,
});
