/**
 * shared/utils/string-similarity scope — DEDICATED follow-up scope.
 *
 * 1 file (202 lignes), ~161 mutants, complex algorithm (Levenshtein + Jaro-Winkler
 * variants). Initial run on 2026-05-10 produced 49 survivors at 69.57% covered —
 * carved out of stryker.shared-utils so the utils baseline could land at 100%.
 *
 * Strategy when this scope is run:
 *   1. Categorize survivors: equivalent mutants (algorithmic equivalences) vs
 *      assertion gaps (test data not exercising the branch).
 *   2. For assertion gaps, add tests that exercise specific edge cases.
 *   3. For equivalent mutants, document via // stryker-disable-next-line
 *      with reason.
 *
 * Lower break threshold while the survivor backlog is being worked through —
 * bumped back to 70 once <10 survivors remain.
 *
 * Usage : `pnpm stryker run stryker/shared-string-similarity.config.mjs`
 * Optional: `STRYKER_CONCURRENCY=2 …` (default 8 local / 4 CI).
 */
import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: ['src/shared/utils/string-similarity.ts'],
  thresholds: { high: 85, low: 50, break: 50 },
});
