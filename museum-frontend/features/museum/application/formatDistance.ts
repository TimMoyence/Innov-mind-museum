/** Threshold (in meters) below which distance is formatted as meters rather than kilometers. */
const METERS_KM_BOUNDARY = 1_000;

/**
 * Minimal shape of i18next's `TFunction` used by `formatDistance`.
 *
 * We deliberately avoid importing the full `TFunction` type from `i18next` here so
 * that this pure formatter stays decoupled from the i18n runtime — simpler to test,
 * and compiles cleanly under the standalone node:test runner (tsconfig.test.json).
 */
export type DistanceTFunction = (
  key: 'museumDirectory.distance_m' | 'museumDirectory.distance_km',
  opts: { distance: number },
) => string;

/**
 * Formats a distance in meters for UI display, picking the unit dynamically:
 *   - `< 1000 m` → "450 m" (rounded to nearest meter)
 *   - `≥ 1000 m` → "2.3 km" (rounded to 1 decimal)
 *
 * Uses the `museumDirectory.distance_m` and `museumDirectory.distance_km` i18n keys
 * so the unit label is localized per locale.
 *
 * @param meters - Raw distance in meters (non-negative).
 * @param t - i18next translation function (or compatible stub).
 * @returns Localized, unit-aware distance string.
 */
export const formatDistance = (meters: number, t: DistanceTFunction): string => {
  if (meters < METERS_KM_BOUNDARY) {
    return t('museumDirectory.distance_m', { distance: Math.round(meters) });
  }
  const km = Math.round(meters / 100) / 10;
  return t('museumDirectory.distance_km', { distance: km });
};
