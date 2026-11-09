import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: [
    'src/shared/validation/**/*.ts',
    '!src/shared/validation/password-breach-check.ts',
    '!src/shared/validation/zod-issue.formatter.ts',
    '!src/**/*.entity.ts',
    '!src/**/*.types.ts',
  ],
});
