/**
 * module/auth/login-handler scope — login-handler helpers (carve-out from `auth`).
 *
 * Targets `src/modules/auth/adapters/primary/http/helpers/login-handler.helpers.ts`
 * (33 NC mutants pre-carve). Carve-out per night-recap sentinel rule: a single
 * helpers file dominating the survivor count justifies its own config so the
 * parent `auth` scope cache stays clean.
 *
 * Usage: `pnpm stryker run stryker/module-auth-login-handler.config.mjs`
 */
import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: ['src/modules/auth/adapters/primary/http/helpers/login-handler.helpers.ts'],
});
