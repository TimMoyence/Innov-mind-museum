import type { NearbyMuseum } from '@modules/chat/domain/location/nearbyMuseum';

export interface ResolvedLocation {
  nearbyMuseums: NearbyMuseum[];
  nearestMuseumDistance: number | null;
  reverseGeocode: string | null;
  reverseGeocodeCoarse: string | null;
  reverseGeocodeNeighbourhood: string | null;
  consentGranularity: 'coarse' | 'full';
  isInsideMuseum: boolean;
}
