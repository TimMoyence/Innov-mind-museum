import { findNearbyMuseums } from '@modules/chat/useCase/enrichment/nearby-museums.provider';
import {
  createCachedNominatimClient,
  reverseGeocodeWithNominatim,
} from '@shared/http/nominatim.client';
import { parseLocationString } from '@shared/utils/location';

import type { ResolvedLocation } from '@modules/chat/domain/location/resolvedLocation';
import type { ChatSession } from '@modules/chat/domain/session/chatSession.entity';
import type { IMuseumRepository } from '@modules/museum/domain/museum/museum.repository.interface';
import type { CacheService } from '@shared/cache/cache.port';
import type { CachedReverseGeocodeFn } from '@shared/http/nominatim.client';

export type { ResolvedLocation };

const IN_MUSEUM_THRESHOLD_M = 200;
const IN_MUSEUM_CACHE_TTL_S = 20 * 60; // 20 minutes
const REVERSE_GEOCODE_TIMEOUT_MS = 3_000;

export interface LocationResolverDeps {
  cache?: CacheService;
  /**
   * Pre-built cached Nominatim reverse-geocoder (usually from
   * {@link createCachedNominatimClient}). Primarily for test injection; in
   * production it is derived from `cache` automatically.
   */
  reverseGeocode?: CachedReverseGeocodeFn;
}

/** Geo-consent scopes the resolver evaluates: full precision and coarse-only. */
export type LocationConsentScope = 'location_to_llm' | 'location_coarse_to_llm';

export interface LocationConsentChecker {
  isGranted(userId: number, scope: LocationConsentScope): Promise<boolean>;
}

/**
 * Resolves a user's GPS coordinates into rich location context for the LLM prompt.
 *
 * Strategy:
 * - User inside a museum (< 200m): cache result for 20min (user won't move much).
 * - User outside a museum: reverse-geocode via Nominatim. The reverse-geocode
 *   itself goes through a cached client (24h positive / 1h negative TTL, rounded
 *   coordinates) so repeated chats from the same street don't hammer Nominatim.
 *   The resolved `ResolvedLocation` is NOT stored under the top-level
 *   `geo:resolve:` key for outside-museum cases — nearby-museum distances still
 *   depend on exact coordinates, so we only cache the expensive external call.
 */
export class LocationResolver {
  private readonly cache: CacheService | undefined;
  private readonly reverseGeocode: (
    lat: number,
    lng: number,
  ) => Promise<Awaited<ReturnType<typeof reverseGeocodeWithNominatim>>>;

  constructor(
    private readonly museumRepository: IMuseumRepository,
    cacheOrDeps?: CacheService | LocationResolverDeps,
  ) {
    const deps: LocationResolverDeps = isDeps(cacheOrDeps) ? cacheOrDeps : { cache: cacheOrDeps };
    this.cache = deps.cache;

    if (deps.reverseGeocode) {
      this.reverseGeocode = deps.reverseGeocode;
    } else if (this.cache) {
      this.reverseGeocode = createCachedNominatimClient(this.cache);
    } else {
      // No cache injected and no explicit fn — fall back to raw live calls.
      // In practice this is only hit in tests; production wiring always
      // passes the shared cache. Rate-limit + UA still apply (module-level).
      this.reverseGeocode = (lat, lng) =>
        reverseGeocodeWithNominatim(lat, lng, REVERSE_GEOCODE_TIMEOUT_MS);
    }
  }

  async resolve(lat: number, lng: number): Promise<ResolvedLocation> {
    const cacheKey = `geo:resolve:${lat.toFixed(3)}:${lng.toFixed(3)}`;

    if (this.cache) {
      const cached = await this.cache.get<ResolvedLocation>(cacheKey);
      if (cached) return cached;
    }

    const nearbyMuseums = await findNearbyMuseums(lat, lng, this.museumRepository);
    const nearestMuseumDistance = nearbyMuseums.length > 0 ? nearbyMuseums[0].distance : null;
    const isInsideMuseum =
      nearestMuseumDistance !== null && nearestMuseumDistance < IN_MUSEUM_THRESHOLD_M;

    if (isInsideMuseum) {
      // Inside a museum -- no reverse geocoding needed, we know where they are
      const result: ResolvedLocation = {
        nearbyMuseums,
        nearestMuseumDistance,
        reverseGeocode: null,
        reverseGeocodeCoarse: null,
        reverseGeocodeNeighbourhood: null,
        consentGranularity: 'full',
        isInsideMuseum,
      };
      // Cache for 20min (user won't move much inside a museum)
      if (this.cache) {
        await this.cache.set(cacheKey, result, IN_MUSEUM_CACHE_TTL_S);
      }
      return result;
    }

    // Outside a museum -- reverse geocode (goes through cached client in prod
    // wiring, so Nominatim is hit at most once per ~111m tile per TTL window).
    let reverseGeocode: string | null = null;
    let reverseGeocodeCoarse: string | null = null;
    let reverseGeocodeNeighbourhood: string | null = null;
    const reverseResult = await this.reverseGeocode(lat, lng);
    if (reverseResult) {
      reverseGeocode = buildFineReverseGeocode(reverseResult);
      reverseGeocodeCoarse = buildCoarseReverseGeocode(reverseResult);
      reverseGeocodeNeighbourhood = buildNeighbourhoodReverseGeocode(reverseResult);
    }

    return {
      nearbyMuseums,
      nearestMuseumDistance,
      reverseGeocode,
      reverseGeocodeCoarse,
      reverseGeocodeNeighbourhood,
      consentGranularity: 'full',
      isInsideMuseum,
    };
  }
}

/**
 * Builds the fine-grained location string used for internal analytics/logs
 * (name + road + suburb + city + country). Preserves the historic behaviour
 * so dashboards and audit reviews continue to work. MUST NOT be emitted to
 * external LLMs.
 */
function buildFineReverseGeocode(result: {
  name?: string;
  address: { road?: string; suburb?: string; city?: string; country?: string };
}): string | null {
  const parts: string[] = [];
  if (result.name) parts.push(result.name);
  if (result.address.road && result.address.road !== result.name) {
    parts.push(result.address.road);
  }
  if (result.address.suburb) parts.push(result.address.suburb);
  if (result.address.city) parts.push(result.address.city);
  if (result.address.country) parts.push(result.address.country);
  return parts.length > 0 ? parts.join(', ') : null;
}

/**
 * Builds the GDPR-safe coarse location string: city + country, or the smallest
 * available locality fallback (suburb or the geocoded `name` field — NEVER the
 * road / house number / postcode). Returned value is intentionally lossy so
 * that a visitor at, say, "12 rue de Rivoli" is only disclosed to the LLM as
 * "Paris, France".
 */
function buildCoarseReverseGeocode(result: {
  name?: string;
  address: { suburb?: string; city?: string; country?: string };
}): string | null {
  const locality = result.address.city ?? result.address.suburb ?? result.name ?? null;
  const country = result.address.country ?? null;
  const parts: string[] = [];
  if (locality) parts.push(locality);
  if (country) parts.push(country);
  return parts.length > 0 ? parts.join(', ') : null;
}

/**
 * Builds the GDPR-safe neighbourhood label emitted under full `location_to_llm`
 * consent: `<neighbourhood ?? suburb>, <city>` (D-FIELD). Finer than coarse but
 * strictly above street level — NEVER `road` / house number / postcode /
 * coordinate (REQ-10). When no quartier field is present it degrades to the
 * coarse city composition (REQ-4a/4b), so a full-consent user never gets less
 * than coarse and there is never a dangling separator.
 */
function buildNeighbourhoodReverseGeocode(result: {
  name?: string;
  address: { neighbourhood?: string; suburb?: string; city?: string; country?: string };
}): string | null {
  const hood = result.address.neighbourhood ?? result.address.suburb ?? null;
  // REQ-4a/4b: no quartier → mirror the coarse city composition (city + country,
  // may be null). A full-consent user thus never gets LESS than coarse.
  if (!hood) return buildCoarseReverseGeocode(result);
  const city = result.address.city ?? null;
  // Quartier present → `<quartier>, <city>` (no country, finer than coarse). City
  // absent is unusual at this granularity; fall back to the quartier alone (no
  // dangling separator).
  return city ? `${hood}, ${city}` : hood;
}

/**
 * Plain CacheService objects expose functions like `get`, never `cache` /
 * `reverseGeocode`, so presence of either sentinel key means it's a deps bag.
 */
function isDeps(arg: CacheService | LocationResolverDeps | undefined): arg is LocationResolverDeps {
  if (!arg) return false;
  return 'cache' in arg || 'reverseGeocode' in arg;
}

export interface ResolveLocationOptions {
  /**
   * Authenticated user id. If omitted (anonymous chat) or if the consent
   * checker denies BOTH geo scopes, the function returns `undefined` and NO
   * location is propagated into the LLM prompt.
   */
  userId?: number;
  /** GDPR consent port. If omitted, consent gating is skipped (legacy paths). */
  consentChecker?: LocationConsentChecker;
}

/**
 * GDPR gate (3-level consent). When a `consentChecker` is supplied, the two geo
 * scopes are evaluated into an effective level:
 *   - `location_to_llm` granted        → `full`  (neighbourhood + city)
 *   - else `location_coarse_to_llm`     → `coarse` (city + country)
 *   - neither (or anonymous, or checker error) → `none` → `undefined`
 * `full` dominates, so the coarse scope is never queried when the full scope is
 * granted (single round-trip, NFR-5). On `none` the function returns `undefined`
 * BEFORE any reverse-geocode, so the LLM prompt carries no geolocation signal —
 * not even the museum name (amendment M2: a "none" user never leaks "their"
 * museum). A checker error is treated as `none` (fail-closed, NFR-6/D-FAILMODE).
 * Without a checker (legacy paths) the level defaults to `full` (D-LEGACY).
 */
export async function resolveLocationForMessage(
  resolver: LocationResolver | undefined,
  rawLocation: string | undefined,
  session: ChatSession,
  options: ResolveLocationOptions = {},
): Promise<ResolvedLocation | undefined> {
  if (!resolver || !rawLocation) return undefined;

  let granularity: 'coarse' | 'full' = 'full';
  if (options.consentChecker) {
    if (!options.userId) return undefined; // REQ-2 anonymous → none
    try {
      const full = await options.consentChecker.isGranted(options.userId, 'location_to_llm');
      // full dominates → short-circuit the coarse query (REQ-1, NFR-5).
      const coarse = full
        ? true
        : await options.consentChecker.isGranted(options.userId, 'location_coarse_to_llm');
      if (!full && !coarse) return undefined; // REQ-1 none → no Nominatim call
      granularity = full ? 'full' : 'coarse';
    } catch {
      // D-FAILMODE / NFR-6: an error in the consent store must NOT leak a
      // location. Treat as `none` (fail-closed) and emit nothing.
      return undefined;
    }
  }

  const coords = parseLocationString(rawLocation);
  if (!coords) return undefined;
  const resolved = await resolver.resolve(coords.lat, coords.lng);
  resolved.consentGranularity = granularity;
  if (resolved.nearbyMuseums.length > 0 && session.visitContext) {
    session.visitContext.nearbyMuseums = resolved.nearbyMuseums;
  }
  return resolved;
}
