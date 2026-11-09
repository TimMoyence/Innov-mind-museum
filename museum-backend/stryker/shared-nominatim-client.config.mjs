import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: ['src/shared/http/nominatim.client.ts'],
});
