import type { NearbyMuseum } from '@modules/chat/domain/location/nearbyMuseum';
import type { ResolvedLocation } from '@modules/chat/domain/location/resolvedLocation';

/**
 * Test factory for {@link NearbyMuseum}. DRY — never inline `{ ... } as NearbyMuseum`.
 * @param overrides Field overrides merged over the defaults.
 * @returns A NearbyMuseum value object.
 */
export function makeNearbyMuseum(overrides: Partial<NearbyMuseum> = {}): NearbyMuseum {
  return {
    id: 1,
    name: 'Musée des Beaux-Arts de Bordeaux',
    distance: 1200,
    ...overrides,
  };
}

/**
 * Test factory for {@link ResolvedLocation}. Defaults model an OUTDOOR coarse
 * location (city + country) — the no-museum / urban-monument scenario where a
 * visitor photographs e.g. the Monument aux Girondins in Bordeaux. No museum is
 * associated; the coarse reverse-geocode is what the LLM prompt is allowed to
 * see once `location_to_llm` consent is granted.
 *
 * DRY — never inline `{ ... } as ResolvedLocation` (CLAUDE.md test discipline).
 * @param overrides Field overrides merged over the outdoor-coarse defaults.
 * @returns A ResolvedLocation value object.
 */
export function makeResolvedLocation(overrides: Partial<ResolvedLocation> = {}): ResolvedLocation {
  return {
    nearbyMuseums: [],
    nearestMuseumDistance: null,
    reverseGeocode: '12 Place des Quinconces, 33000 Bordeaux, France',
    reverseGeocodeCoarse: 'Bordeaux, France',
    // Cycle 1.5 — GDPR-safe neighbourhood + city label (finer than coarse, never
    // road / house number / coordinate). Emitted only under `location_to_llm`
    // (full granularity). Defaults to a Bordeaux quartier consistent with the
    // coarse default above so existing call sites stay coherent.
    reverseGeocodeNeighbourhood: 'Quinconces, Bordeaux',
    // Cycle 1.5 — effective consent level carried by the resolver; the
    // prompt-builder picks the field (coarse vs neighbourhood) from this. Default
    // `'full'` mirrors the legacy/no-checker path (D-LEGACY recommendation).
    consentGranularity: 'full',
    isInsideMuseum: false,
    ...overrides,
  };
}
