import type { CorsOptions } from 'cors';

export function resolveCorsOrigin(
  origins: readonly string[],
  isProd: boolean,
): CorsOptions['origin'] {
  return origins.length > 0 ? [...origins] : !isProd;
}
