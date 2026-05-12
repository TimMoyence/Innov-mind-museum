/**
 * shared/utils scope — fire-and-forget, haversine, location.
 * 3 fichiers utilitaires purs (string-similarity.ts exclu, voir
 * stryker/shared-string-similarity.config.mjs — algorithme dense, 49 survivors
 * justifient un scope dédié pour ne pas polluer cette baseline).
 *
 * Usage : `pnpm stryker run stryker/shared-utils.config.mjs`
 * Optional: `STRYKER_CONCURRENCY=2 …` (default 8 local / 4 CI).
 */
import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: [
    'src/shared/utils/**/*.ts',
    '!src/shared/utils/string-similarity.ts',
    '!src/**/*.entity.ts',
    '!src/**/*.types.ts',
  ],
});
