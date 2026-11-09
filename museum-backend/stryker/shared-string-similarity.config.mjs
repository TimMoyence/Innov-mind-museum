import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: ['src/shared/utils/string-similarity.ts'],
  thresholds: { high: 85, low: 50, break: 50 },
});
