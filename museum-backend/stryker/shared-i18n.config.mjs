import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: ['src/shared/i18n/**/*.ts', '!src/**/*.entity.ts', '!src/**/*.types.ts'],
});
