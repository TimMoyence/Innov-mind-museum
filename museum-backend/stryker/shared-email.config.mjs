/**
 * shared/email scope — Brevo email service + email-locale helpers + ports.
 * 4 fichiers.
 *
 * Usage : `pnpm stryker run stryker/shared-email.config.mjs`
 * Optional: `STRYKER_CONCURRENCY=2 …` (default 8 local / 4 CI).
 */
import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: ['src/shared/email/**/*.ts', '!src/**/*.entity.ts', '!src/**/*.types.ts'],
});
