import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: ['src/modules/review/**/*.ts', '!src/**/*.entity.ts', '!src/**/*.types.ts'],
});
