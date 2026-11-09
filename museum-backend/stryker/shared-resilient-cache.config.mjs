import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: ['src/shared/cache/resilient-cache.wrapper.ts'],
  thresholds: { high: 85, low: 50, break: 50 },
});
