/**
 * shared/validation/password-breach-check scope — DEDICATED follow-up scope.
 *
 * 1 file (149 lignes), 79 mutants, HIBP k-anonymity client + assertPasswordNotBreached.
 * Initial run on 2026-05-10 produced 14 survivors at 81.82% covered — carved out
 * of stryker.shared-validation so that baseline could land at 100%.
 *
 * Survivor categories observed:
 *   - StringLiteral mutants on log event names ('hibp_unexpected_status', 'hibp_unavailable_failopen')
 *   - ObjectLiteral mutants on logger.warn / captureExceptionWithContext payloads
 *   - LogicalOperator mutant on `options.timeoutMs ?? DEFAULT_TIMEOUT_MS`
 *   - ConditionalExpression on `if (result.breached) throw AppError`
 *
 * Strategy when this scope is run: extend tests/unit/auth/password-breach-check.test.ts
 * with assertions on logger.warn calls (event name + meta), captureExceptionWithContext
 *
 * Usage : `pnpm stryker run stryker/shared-password-breach-check.config.mjs`
 * Optional: `STRYKER_CONCURRENCY=2 …` (default 8 local / 4 CI).
 */
import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: ['src/shared/validation/password-breach-check.ts'],
});
