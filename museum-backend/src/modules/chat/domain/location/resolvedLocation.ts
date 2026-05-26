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
   * send to external LLM subject to `location_coarse_to_llm` consent scope.
   */
  reverseGeocodeCoarse: string | null;
  /**
   * GDPR-safe neighbourhood + city (`<neighbourhood ?? suburb>, <city>`), finer
   * than coarse but NEVER street/house-number/postcode/coordinate. Degrades to
   * the coarse city composition when no quartier is available (REQ-4a), so a
   * full-consent user never gets less than coarse. Emitted to the external LLM
   * only under the full `location_to_llm` consent scope.
   */
  reverseGeocodeNeighbourhood: string | null;
  /**
   * Effective geo-consent level carried from `resolveLocationForMessage`. The
   * prompt-builder uses it to pick which label to emit: `coarse` → city only,
   * `full` → neighbourhood (degrading to city). `resolve()` itself cannot know
   * the consent level, so it defaults to `'full'`; the use-case overrides it.
   */
  consentGranularity: 'coarse' | 'full';
  isInsideMuseum: boolean;
}
