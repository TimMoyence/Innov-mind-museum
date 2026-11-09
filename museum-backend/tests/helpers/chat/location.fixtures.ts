import type { NearbyMuseum } from '@modules/chat/domain/location/nearbyMuseum';
import type { ResolvedLocation } from '@modules/chat/domain/location/resolvedLocation';

export function makeNearbyMuseum(overrides: Partial<NearbyMuseum> = {}): NearbyMuseum {
  return {
    id: 1,
    name: 'Musée des Beaux-Arts de Bordeaux',
    distance: 1200,
    ...overrides,
  };
}

export function makeResolvedLocation(overrides: Partial<ResolvedLocation> = {}): ResolvedLocation {
  return {
    nearbyMuseums: [],
    nearestMuseumDistance: null,
    reverseGeocode: '12 Place des Quinconces, 33000 Bordeaux, France',
    reverseGeocodeCoarse: 'Bordeaux, France',
    reverseGeocodeNeighbourhood: 'Quinconces, Bordeaux',
    consentGranularity: 'full',
    isInsideMuseum: false,
    ...overrides,
  };
}
