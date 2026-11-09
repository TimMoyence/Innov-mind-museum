import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: [
    'src/shared/utils/**/*.ts',
    '!src/shared/utils/string-similarity.ts',
    '!src/**/*.entity.ts',
    '!src/**/*.types.ts',
  ],
});
