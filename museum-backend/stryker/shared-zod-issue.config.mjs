import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: ['src/shared/validation/zod-issue.formatter.ts'],
});
