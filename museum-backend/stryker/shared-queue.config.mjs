import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: ['src/shared/queue/scheduled-jobs.ts', '!src/**/*.entity.ts', '!src/**/*.types.ts'],
});
