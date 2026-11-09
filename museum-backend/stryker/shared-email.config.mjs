import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: ['src/shared/email/**/*.ts', '!src/**/*.entity.ts', '!src/**/*.types.ts'],
});
