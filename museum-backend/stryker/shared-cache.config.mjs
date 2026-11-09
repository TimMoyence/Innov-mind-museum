import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: [
    'src/shared/cache/**/*.ts',
    '!src/shared/cache/memory-cache.service.ts',
    '!src/shared/cache/resilient-cache.wrapper.ts',
    '!src/**/*.entity.ts',
    '!src/**/*.types.ts',
  ],
});
