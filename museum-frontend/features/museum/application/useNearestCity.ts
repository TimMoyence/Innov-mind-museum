import { CITY_CATALOG } from '../infrastructure/cityCatalog';
import type { CityId } from '../infrastructure/cityCatalog';
import type { MuseumWithDistance } from './useMuseumDirectory';

export interface NearestCity {
  cityId: CityId;
  cityName: string;
}

/**
 * Derives the nearest city from the sorted museum list by checking whether
 * the closest museum's coordinates (museums[0]) fall within one of the
 * gated city bounding boxes in the catalog.
 *
 * Returns null when:
 * - The museum list is empty.
 * - The nearest museum has no coordinates.
 * - No catalog city contains those coordinates.
 *
 * `museums` is assumed pre-sorted by distance (ascending) — the same order
 * that `useMuseumDirectory` guarantees via its internal sort.
 *
 * Manual useMemo omitted intentionally — the React Compiler handles
 * memoization for this hook automatically.
 */
export function useNearestCity(museums: readonly MuseumWithDistance[]): NearestCity | null {
  const nearest = museums[0];
  if (!nearest) return null;

  const { latitude, longitude } = nearest;
  if (latitude == null || longitude == null) return null;

  for (const city of CITY_CATALOG) {
    const [west, south, east, north] = city.bounds;
    if (
      west !== undefined &&
      south !== undefined &&
      east !== undefined &&
      north !== undefined &&
      longitude >= west &&
      longitude <= east &&
      latitude >= south &&
      latitude <= north
    ) {
      return { cityId: city.id, cityName: city.name };
    }
  }

  return null;
}
