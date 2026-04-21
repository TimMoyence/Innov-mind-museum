import type { CorsOptions } from 'cors';

/**
 * Resolves the `origin` value passed to the `cors` middleware from the runtime
 * env + NODE_ENV context. Kept as a pure function so the SSRF-neighbouring
 * policy surface is verifiable in isolation.
 *
 * Matrix (audit-validated 2026-04-21, ADR-006 neighbourhood):
 *
 * | NODE_ENV | corsOrigins | result                 | behaviour           |
 * |----------|-------------|------------------------|---------------------|
 * | prod     | []          | `false`                | reject all origins  |
 * | prod     | [a, b]      | `[a, b]`               | allow listed only   |
 * | dev/test | []          | `true`                 | wildcard (DX)       |
 * | dev/test | [a, b]      | `[a, b]`               | allow listed only   |
 *
 * The 2026-04-20 audit flagged "prod empty CORS_ORIGINS = self-DoS". Verified
 * as a FALSE POSITIVE: the `false` branch is the safe-by-default posture;
 * misconfigured prod deploys still reject cross-origin rather than wildcarding.
 *
 * @param origins - Parsed CORS_ORIGINS list (see `toList` in config/env.ts).
 * @param isProd - Whether NODE_ENV === 'production'.
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
