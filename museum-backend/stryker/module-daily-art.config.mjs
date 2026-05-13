/**
 * module/daily-art scope — daily-art rotation + selection logic.
 *
 * Mutates the 4 .ts files under `src/modules/daily-art/**` excluding entities,
 * static data (`artworks.data.ts` token-discipline'd), and migrations.
 *
 * Usage: `pnpm stryker run stryker/module-daily-art.config.mjs`
 */
import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: [
    'src/modules/daily-art/**/*.ts',
    '!src/**/*.entity.ts',
    '!src/**/*.types.ts',
    '!src/modules/daily-art/artworks.data.ts',
  ],
});
