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
