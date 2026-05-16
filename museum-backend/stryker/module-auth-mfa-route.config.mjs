/**
 * module/auth/mfa-route scope — MFA HTTP route (carve-out from `auth`).
 *
 * Targets `src/modules/auth/adapters/primary/http/routes/mfa.route.ts` (61 NC
 * mutants pre-carve). Carve-out per night-recap sentinel rule: a single
 * route file dominating the survivor count justifies its own config so the
 * parent `auth` scope cache stays clean and iteration on mfa.route is fast.
 *
 * Usage: `pnpm stryker run stryker/module-auth-mfa-route.config.mjs`
 */
import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: ['src/modules/auth/adapters/primary/http/routes/mfa.route.ts'],
});
