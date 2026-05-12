/**
 * shared-misc bundle — single-file dirs grouped to amortize Stryker boot.
 * 6 dirs : errors, logger, media, pagination, ports, rate-limit.
 * Routers carved out 2026-05-11 to `stryker/shared-routers.config.mjs`.
 *
 * Usage : `pnpm stryker run stryker/shared-misc.config.mjs`
 * Optional: `STRYKER_CONCURRENCY=2 …` (default 8 local / 4 CI).
 */
import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: [
    'src/shared/errors/**/*.ts',
    'src/shared/logger/**/*.ts',
    'src/shared/media/**/*.ts',
    'src/shared/pagination/**/*.ts',
    'src/shared/ports/**/*.ts',
    'src/shared/rate-limit/**/*.ts',
    '!src/**/*.entity.ts',
    '!src/**/*.types.ts',
  ],
});
