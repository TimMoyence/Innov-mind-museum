import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: ['src/shared/db/**/*.ts', '!src/**/*.entity.ts', '!src/**/*.types.ts'],
  dryRunTimeoutMinutes: 10,
});
