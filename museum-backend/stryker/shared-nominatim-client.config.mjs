/**
 * shared/http carve-out — nominatim.client.ts only.
 *
 * Pulled out of `stryker/shared-http.config.mjs` (which now scopes the
 * overpass-cache/-tags/wikidata-ids trio at 100% covered) so the larger
 * 432-line Nominatim HTTP client can iterate independently without re-
 * mutating the small files every cycle.
 *
 * Usage: `pnpm stryker run stryker/shared-nominatim-client.config.mjs`
 * Optional: `STRYKER_CONCURRENCY=4 …` (default 8 local / 4 CI).
 */
import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: ['src/shared/http/nominatim.client.ts'],
});
