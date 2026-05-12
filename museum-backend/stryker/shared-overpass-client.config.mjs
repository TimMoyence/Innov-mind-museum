/**
 * shared/http carve-out — overpass.client.ts only.
 *
 * Pulled out of `stryker/shared-http.config.mjs` (which scopes the
 * smaller overpass-cache/-tags/wikidata-ids trio at 100% covered) so the
 * 208-line Overpass HTTP client with caching layer can iterate independently.
 *
 * Usage: `pnpm stryker run stryker/shared-overpass-client.config.mjs`
 * Optional: `STRYKER_CONCURRENCY=4 …` (default 8 local / 4 CI).
 */
import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: ['src/shared/http/overpass.client.ts'],
});
