/**
 * module/admin scope — admin panel APIs (dashboards, audit, user listing).
 *
 * Mutates `src/modules/admin/**` (20 files: useCases, http routes, pg adapters).
 *
 * Usage: `pnpm stryker run stryker/module-admin.config.mjs`
 */
import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: ['src/modules/admin/**/*.ts', '!src/**/*.entity.ts', '!src/**/*.types.ts'],
});
