import type { NearbyMuseum } from '@modules/chat/domain/location/nearbyMuseum';

/** Resolved geolocation context for a single chat message. */
export interface ResolvedLocation {
  nearbyMuseums: NearbyMuseum[];
  nearestMuseumDistance: number | null;
  /**
   * Fine-grained reverse geocode string (name + road + suburb + city + country).
   * NEVER emit this to third-party LLMs — it contains street-level detail that
   * uniquely pin-points the user. Keep strictly for internal analytics / logs
   * when the user has consented to higher-fidelity processing.
   */
  reverseGeocode: string | null;
  /**
   * GDPR-safe coarse reverse geocode string containing ONLY city + country (or
   * the smallest available locality fallback). Safe to send to external LLM
   * providers subject to user consent (`location_to_llm` scope).
   */
  reverseGeocodeCoarse: string | null;
  isInsideMuseum: boolean;
}
