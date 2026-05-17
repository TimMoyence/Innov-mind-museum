import type { NearbyMuseum } from '@modules/chat/domain/location/nearbyMuseum';

export interface ResolvedLocation {
  nearbyMuseums: NearbyMuseum[];
  nearestMuseumDistance: number | null;
  /**
   * Fine-grained (name + road + suburb + city + country). NEVER emit to
   * third-party LLMs — street-level detail uniquely pin-points the user.
   * Internal analytics/logs only, subject to higher-fidelity consent.
   */
  reverseGeocode: string | null;
  /**
   * GDPR-safe coarse (city + country, or smallest locality fallback). Safe to
   * send to external LLM subject to `location_to_llm` consent scope.
   */
  reverseGeocodeCoarse: string | null;
  isInsideMuseum: boolean;
}
