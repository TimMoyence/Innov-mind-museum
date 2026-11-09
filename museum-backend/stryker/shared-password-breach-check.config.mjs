import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: ['src/shared/validation/password-breach-check.ts'],
});
