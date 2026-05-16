/**
 * module/knowledge-extraction scope — Wikidata + artwork enrichment.
 *
 * Mutates `src/modules/knowledge-extraction/**` (17 files: useCases, KB
 * adapters, image similarity bridges).
 *
 * Usage: `pnpm stryker run stryker/module-knowledge-extraction.config.mjs`
 */
import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: [
    'src/modules/knowledge-extraction/**/*.ts',
    '!src/**/*.entity.ts',
    '!src/**/*.types.ts',
  ],
});
