const METERS_KM_BOUNDARY = 1_000;

export type DistanceTFunction = (
  key: 'museumDirectory.distance_m' | 'museumDirectory.distance_km',
  opts: { distance: number },
) => string;

export const formatDistance = (meters: number, t: DistanceTFunction): string => {
  if (meters < METERS_KM_BOUNDARY) {
    return t('museumDirectory.distance_m', { distance: Math.round(meters) });
  }
  const km = Math.round(meters / 100) / 10;
  return t('museumDirectory.distance_km', { distance: km });
};
