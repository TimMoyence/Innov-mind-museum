/**
 * module/auth/totp scope — TOTP MFA use cases + helpers.
 *
 * Bootstraps the first module-level scope of the Stryker cache. Covers
 * the R16 TOTP enrollment + verification + recovery suite that backs the
 * MFA endpoints in `museum-backend/src/modules/auth/adapters/primary/http/routes/mfa.route.ts`.
 *
 * Usage: `pnpm stryker run stryker/module-auth-totp.config.mjs`
 * Optional: `STRYKER_CONCURRENCY=4 …` (default 8 local / 4 CI).
 */
import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: ['src/modules/auth/useCase/totp/**/*.ts', '!src/**/*.entity.ts', '!src/**/*.types.ts'],
});
