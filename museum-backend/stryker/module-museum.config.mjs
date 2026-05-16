/**
 * module/museum scope — museum catalog + tour points-of-interest.
 *
 * Mutates `src/modules/museum/**` (28 files: useCases, http routes, pg adapters,
 * tour generation).
 *
 * Usage: `pnpm stryker run stryker/module-museum.config.mjs`
 */
import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: ['src/modules/museum/**/*.ts', '!src/**/*.entity.ts', '!src/**/*.types.ts'],
});
