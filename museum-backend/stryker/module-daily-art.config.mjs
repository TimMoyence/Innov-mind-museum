import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: [
    'src/modules/daily-art/**/*.ts',
    '!src/**/*.entity.ts',
    '!src/**/*.types.ts',
    '!src/modules/daily-art/artworks.data.ts',
  ],
});
