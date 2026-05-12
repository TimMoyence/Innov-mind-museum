/**
 * shared/db scope — jsonb schemas + jsonb-validator + optimistic-lock-retry.
 * 10 fichiers (8 schemas + 2 utils). Schemas excluded if .types.ts.
 *
 * Usage : `pnpm stryker run stryker/shared-db.config.mjs`
 * Optional: `STRYKER_CONCURRENCY=2 …` (default 8 local / 4 CI).
 *
 * dryRunTimeoutMinutes bumped from default 5min — under heavy concurrent
 * agents the initial 4123-test dry-run can take 6+ min on M1 Pro. Per-mutant
 * timeouts are unaffected.
 */
import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: ['src/shared/db/**/*.ts', '!src/**/*.entity.ts', '!src/**/*.types.ts'],
  dryRunTimeoutMinutes: 10,
});
