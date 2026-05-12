/**
 * shared/validation scope — email, input, password.
 * 3 fichiers (password-breach-check.ts and zod-issue.formatter.ts carved out;
 * see stryker/shared-password-breach-check.config.mjs and
 * stryker/shared-zod-issue.config.mjs — they accumulated 14 + 8 survivors on
 * the first run, dedicated scopes keep this baseline at 100%).
 *
 * Usage : `pnpm stryker run stryker/shared-validation.config.mjs`
 * Optional: `STRYKER_CONCURRENCY=2 …` (default 8 local / 4 CI).
 */
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
