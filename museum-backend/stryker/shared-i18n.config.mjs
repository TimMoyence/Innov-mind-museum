/**
 * shared/i18n scope — fallback messages, guardrail refusals, locale helpers.
 * 3 fichiers, ~80-150 mutants estimés.
 *
 * Usage : `pnpm stryker run stryker/shared-i18n.config.mjs`
 * Optional: `STRYKER_CONCURRENCY=2 …` (default 8 local / 4 CI).
 */
import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: ['src/shared/i18n/**/*.ts', '!src/**/*.entity.ts', '!src/**/*.types.ts'],
});
