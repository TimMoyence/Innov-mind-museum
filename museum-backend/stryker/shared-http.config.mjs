import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: [
    'src/shared/http/overpass-cache.ts',
    'src/shared/http/overpass-tags.ts',
    'src/shared/http/wikidata-ids.ts',
  ],
});
