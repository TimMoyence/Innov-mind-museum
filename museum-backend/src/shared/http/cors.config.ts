import type { CorsOptions } from 'cors';

/**
 * SEC/CORS (ADR-006 neighbourhood, audit 2026-04-21). Matrix:
 *   prod + [] → `false` (reject all — safe-by-default)
 *   prod + listed → allowed listed only
 *   dev/test + [] → `true` (wildcard, DX)
 *   dev/test + listed → allowed listed only
 * 2026-04-20 audit flagged "prod empty CORS = self-DoS" — FALSE POSITIVE: misconfig still
 * rejects cross-origin rather than wildcarding.
 */
// eslint-disable-next-line sonarjs/function-return-type -- cors middleware's `origin` option is natively a union (boolean | string | RegExp | (string|RegExp)[] | CustomOrigin). The helper mirrors that library contract exactly; collapsing to a single type would hide the safe-by-default boolean branch.
export function resolveCorsOrigin(
  origins: readonly string[],
  isProd: boolean,
): CorsOptions['origin'] {
  if (origins.length > 0) {
    return [...origins];
  }
  return !isProd;
}
