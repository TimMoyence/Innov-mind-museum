import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: ['src/modules/knowledge-extraction/**/*.ts', '!src/**/*.entity.ts', '!src/**/*.types.ts'],
});
