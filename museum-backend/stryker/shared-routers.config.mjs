/**
 * shared/routers carve-out — api.router.ts only.
 *
 * Carved out of `stryker/shared-misc.config.mjs` (2026-05-11) because
 * api.router.ts alone accounted for 57 of the bundle's survivors (DI-style
 * wiring with optional service params is mutation-dense). Isolating it
 * lets us iterate kill-survivor work without re-mutating the entire misc
 * bundle every cycle.
 *
 * Usage: `pnpm stryker run stryker/shared-routers.config.mjs`
 * Optional: `STRYKER_CONCURRENCY=2 …` (default 8 local / 4 CI).
 */
import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: ['src/shared/routers/**/*.ts'],
});
