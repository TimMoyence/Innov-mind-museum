import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: ['src/shared/cache/memory-cache.service.ts'],
  thresholds: { high: 85, low: 60, break: 60 },
});
