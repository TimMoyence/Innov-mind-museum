import { CITY_CATALOG } from '../infrastructure/cityCatalog';
import type { CityId } from '../infrastructure/cityCatalog';
import type { MuseumWithDistance } from './useMuseumDirectory';

export interface NearestCity {
  cityId: CityId;
  cityName: string;
}

export function useNearestCity(museums: readonly MuseumWithDistance[]): NearestCity | null {
  const nearest = museums[0];
  if (!nearest) return null;

  const { latitude, longitude } = nearest;
  if (latitude == null || longitude == null) return null;

  for (const city of CITY_CATALOG) {
    const [west, south, east, north] = city.bounds;
    if (longitude >= west && longitude <= east && latitude >= south && latitude <= north) {
      return { cityId: city.id, cityName: city.name };
    }
  }

  return null;
}
