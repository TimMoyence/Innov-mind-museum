/**
 * module/review scope — review moderation + notifier.
 *
 * Mutates `src/modules/review/**` (15 files: useCases, pg adapters, notifier).
 *
 * Usage: `pnpm stryker run stryker/module-review.config.mjs`
 */
import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: ['src/modules/review/**/*.ts', '!src/**/*.entity.ts', '!src/**/*.types.ts'],
});
