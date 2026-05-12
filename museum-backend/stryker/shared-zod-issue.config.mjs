/**
 * shared/validation/zod-issue.formatter scope — DEDICATED follow-up scope.
 *
 * 1 file (~34 lignes), 24 mutants. Initial run on 2026-05-10 produced 8 survivors
 * at 63.64% covered — formatZodIssue / formatZodIssues lack dedicated tests
 * (they are exercised transitively via validateBody middleware tests). Carved
 * out of stryker.shared-validation so that baseline could land at 100%.
 *
 * Strategy when this scope is run: create
 * `tests/unit/shared/validation/zod-issue-formatter.test.ts` with cases for:
 *   - undefined issue -> 'Invalid payload'
 *   - empty path -> raw message
 *   - message already prefixed with `<path> ` or `<path>.` -> raw
 *   - otherwise `<path> <message>`
 *   - empty issues array -> 'Invalid payload'
 *   - non-empty issues -> joined with ', '
 *
 * Usage : `pnpm stryker run stryker/shared-zod-issue.config.mjs`
 * Optional: `STRYKER_CONCURRENCY=2 …` (default 8 local / 4 CI).
 */
import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: ['src/shared/validation/zod-issue.formatter.ts'],
});
