import { reverseGeocodeWithNominatim } from '@shared/http/nominatim.client';
import { parseLocationString } from '@shared/utils/location';

import { findNearbyMuseums } from './nearby-museums.provider';

import type { NearbyMuseum } from './nearby-museums.provider';
import type { ChatSession } from '../domain/chatSession.entity';
import type { IMuseumRepository } from '@modules/museum/domain/museum.repository.interface';
import type { CacheService } from '@shared/cache/cache.port';

const IN_MUSEUM_THRESHOLD_M = 200;
const IN_MUSEUM_CACHE_TTL_S = 20 * 60; // 20 minutes
const REVERSE_GEOCODE_TIMEOUT_MS = 3_000;

/** Resolved geolocation context for a single chat message. */
export interface ResolvedLocation {
  nearbyMuseums: NearbyMuseum[];
  nearestMuseumDistance: number | null;
  reverseGeocode: string | null;
  isInsideMuseum: boolean;
}

/**
 * Resolves a user's GPS coordinates into rich location context for the LLM prompt.
 *
 * Strategy:
 * - User inside a museum (< 200m): cache result for 20min (user won't move much).
 * - User in the city (> 200m): reverse geocode via Nominatim, NO cache (user is moving).
 */
export class LocationResolver {
  constructor(
    private readonly museumRepository: IMuseumRepository,
    private readonly cache?: CacheService,
  ) {}

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
        isInsideMuseum,
      };
      // Cache for 20min (user won't move much inside a museum)
      if (this.cache) {
        await this.cache.set(cacheKey, result, IN_MUSEUM_CACHE_TTL_S);
      }
      return result;
    }

    // In the city -- do reverse geocoding for exact location, NO cache (user is moving)
    let reverseGeocode: string | null = null;
    const reverseResult = await reverseGeocodeWithNominatim(lat, lng, REVERSE_GEOCODE_TIMEOUT_MS);
    if (reverseResult) {
      // Build a concise location string for the LLM
      const parts: string[] = [];
      if (reverseResult.name) parts.push(reverseResult.name);
      if (reverseResult.address.road && reverseResult.address.road !== reverseResult.name) {
        parts.push(reverseResult.address.road);
      }
      if (reverseResult.address.suburb) parts.push(reverseResult.address.suburb);
      if (reverseResult.address.city) parts.push(reverseResult.address.city);
      if (reverseResult.address.country) parts.push(reverseResult.address.country);
      reverseGeocode = parts.join(', ');
    }

    return { nearbyMuseums, nearestMuseumDistance, reverseGeocode, isInsideMuseum };
  }
}

/**
 * Parses a raw location string from the chat message context, resolves it via
 * the provided {@link LocationResolver}, and merges the nearby museums into the
 * session's transient visit context.
 *
 * @returns The resolved location, or undefined if the resolver or location string is absent/invalid.
 */
export async function resolveLocationForMessage(
  resolver: LocationResolver | undefined,
  rawLocation: string | undefined,
  session: ChatSession,
): Promise<ResolvedLocation | undefined> {
  if (!resolver || !rawLocation) return undefined;
  const coords = parseLocationString(rawLocation);
  if (!coords) return undefined;
  const resolved = await resolver.resolve(coords.lat, coords.lng);
  if (resolved.nearbyMuseums.length > 0 && session.visitContext) {
    session.visitContext.nearbyMuseums = resolved.nearbyMuseums;
  }
  return resolved;
}
