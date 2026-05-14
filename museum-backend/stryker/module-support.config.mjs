/**
 * module/support scope — support contact form + notifier.
 *
 * Mutates `src/modules/support/**` (17 files: useCases, http routes, notifier).
 *
 * Usage: `pnpm stryker run stryker/module-support.config.mjs`
 */
import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: ['src/modules/support/**/*.ts', '!src/**/*.entity.ts', '!src/**/*.types.ts'],
});
