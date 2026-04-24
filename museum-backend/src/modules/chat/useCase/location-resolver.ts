import {
  createCachedNominatimClient,
  reverseGeocodeWithNominatim,
} from '@shared/http/nominatim.client';
import { parseLocationString } from '@shared/utils/location';

import { findNearbyMuseums } from './nearby-museums.provider';

import type { NearbyMuseum } from './nearby-museums.provider';
import type { ChatSession } from '../domain/chatSession.entity';
import type { IMuseumRepository } from '@modules/museum/domain/museum.repository.interface';
import type { CacheService } from '@shared/cache/cache.port';
import type { CachedReverseGeocodeFn } from '@shared/http/nominatim.client';

const IN_MUSEUM_THRESHOLD_M = 200;
const IN_MUSEUM_CACHE_TTL_S = 20 * 60; // 20 minutes
const REVERSE_GEOCODE_TIMEOUT_MS = 3_000;

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

/** Optional dependencies for {@link LocationResolver}. */
export interface LocationResolverDeps {
  /** Shared cache service; used to memoise both in-museum results and Nominatim reverse lookups. */
  cache?: CacheService;
  /**
   * Pre-built cached Nominatim reverse-geocoder (usually from
   * {@link createCachedNominatimClient}). Primarily for test injection; in
   * production it is derived from `cache` automatically.
   */
  reverseGeocode?: CachedReverseGeocodeFn;
}

/** Port used by {@link resolveLocationForMessage} to gate location on consent. */
export interface LocationConsentChecker {
  isGranted(userId: number, scope: 'location_to_llm'): Promise<boolean>;
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

  /**
   * Resolves the given coordinates into nearby museums and (optionally) a reverse-geocoded address.
   *
   * @param lat - Latitude in degrees.
   * @param lng - Longitude in degrees.
   * @returns The resolved location context ready for LLM prompt injection.
   */
  async resolve(lat: number, lng: number): Promise<ResolvedLocation> {
    const cacheKey = `geo:resolve:${lat.toFixed(3)}:${lng.toFixed(3)}`;

    // Check cache first
    if (this.cache) {
      const cached = await this.cache.get<ResolvedLocation>(cacheKey);
      if (cached) return cached;
    }

    // Resolve nearby museums
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
    const reverseResult = await this.reverseGeocode(lat, lng);
    if (reverseResult) {
      reverseGeocode = buildFineReverseGeocode(reverseResult);
      reverseGeocodeCoarse = buildCoarseReverseGeocode(reverseResult);
    }

    return {
      nearbyMuseums,
      nearestMuseumDistance,
      reverseGeocode,
      reverseGeocodeCoarse,
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
 * Narrow a constructor argument to the options bag shape.
 * Plain CacheService objects expose functions like `get`, never `cache` /
 * `reverseGeocode`, so presence of either sentinel key means it's a deps bag.
 */
function isDeps(arg: CacheService | LocationResolverDeps | undefined): arg is LocationResolverDeps {
  if (!arg) return false;
  return 'cache' in arg || 'reverseGeocode' in arg;
}

/** Options bag for {@link resolveLocationForMessage}. */
export interface ResolveLocationOptions {
  /**
   * Authenticated user id. If omitted (anonymous chat) or if the consent
   * checker denies the `location_to_llm` scope, the function returns
   * `undefined` and NO location is propagated into the LLM prompt.
   */
  userId?: number;
  /** GDPR consent port. If omitted, consent gating is skipped (legacy paths). */
  consentChecker?: LocationConsentChecker;
}

/**
 * Parses a raw location string from the chat message context, resolves it via
 * the provided {@link LocationResolver}, and merges the nearby museums into the
 * session's transient visit context.
 *
 * GDPR gate: when a `consentChecker` is supplied, the resolver is only invoked
 * when the user has actively granted the `location_to_llm` scope. Without
 * consent this function returns `undefined` (equivalent to the user not
 * sharing a location at all), so the LLM prompt carries no geolocation signal.
 *
 * @returns The resolved location, or undefined if the resolver or location string is absent/invalid/denied.
 */
export async function resolveLocationForMessage(
  resolver: LocationResolver | undefined,
  rawLocation: string | undefined,
  session: ChatSession,
  options: ResolveLocationOptions = {},
): Promise<ResolvedLocation | undefined> {
  if (!resolver || !rawLocation) return undefined;

  if (options.consentChecker) {
    if (!options.userId) return undefined;
    const allowed = await options.consentChecker.isGranted(options.userId, 'location_to_llm');
    if (!allowed) return undefined;
  }

  const coords = parseLocationString(rawLocation);
  if (!coords) return undefined;
  const resolved = await resolver.resolve(coords.lat, coords.lng);
  if (resolved.nearbyMuseums.length > 0 && session.visitContext) {
    session.visitContext.nearbyMuseums = resolved.nearbyMuseums;
  }
  return resolved;
}
