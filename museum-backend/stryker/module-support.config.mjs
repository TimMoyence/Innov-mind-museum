import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: ['src/modules/support/**/*.ts', '!src/**/*.entity.ts', '!src/**/*.types.ts'],
});
