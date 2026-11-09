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
const IN_MUSEUM_CACHE_TTL_S = 20 * 60;
const REVERSE_GEOCODE_TIMEOUT_MS = 3_000;

export interface LocationResolverDeps {
  cache?: CacheService;
  reverseGeocode?: CachedReverseGeocodeFn;
}

export type LocationConsentScope = 'location_to_llm' | 'location_coarse_to_llm';

export interface LocationConsentChecker {
  isGranted(userId: number, scope: LocationConsentScope): Promise<boolean>;
}

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
      const result: ResolvedLocation = {
        nearbyMuseums,
        nearestMuseumDistance,
        reverseGeocode: null,
        reverseGeocodeCoarse: null,
        reverseGeocodeNeighbourhood: null,
        consentGranularity: 'full',
        isInsideMuseum,
      };
      if (this.cache) {
        await this.cache.set(cacheKey, result, IN_MUSEUM_CACHE_TTL_S);
      }
      return result;
    }

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

function buildNeighbourhoodReverseGeocode(result: {
  name?: string;
  address: { neighbourhood?: string; suburb?: string; city?: string; country?: string };
}): string | null {
  const hood = result.address.neighbourhood ?? result.address.suburb ?? null;
  if (!hood) return buildCoarseReverseGeocode(result);
  const city = result.address.city ?? null;
  return city ? `${hood}, ${city}` : hood;
}

function isDeps(arg: CacheService | LocationResolverDeps | undefined): arg is LocationResolverDeps {
  if (!arg) return false;
  return 'cache' in arg || 'reverseGeocode' in arg;
}

export interface ResolveLocationOptions {
  userId?: number;
  consentChecker?: LocationConsentChecker;
}

export async function resolveLocationForMessage(
  resolver: LocationResolver | undefined,
  rawLocation: string | undefined,
  session: ChatSession,
  options: ResolveLocationOptions = {},
): Promise<ResolvedLocation | undefined> {
  if (!resolver || !rawLocation) return undefined;

  let granularity: 'coarse' | 'full' = 'full';
  if (options.consentChecker) {
    if (!options.userId) return undefined;
    try {
      const full = await options.consentChecker.isGranted(options.userId, 'location_to_llm');
      const coarse = full
        ? true
        : await options.consentChecker.isGranted(options.userId, 'location_coarse_to_llm');
      if (!full && !coarse) return undefined;
      granularity = full ? 'full' : 'coarse';
    } catch {
      return undefined;
    }
  }

  const coords = parseLocationString(rawLocation);
  if (!coords) return undefined;
  const resolved = await resolver.resolve(coords.lat, coords.lng);
  const withGranularity = { ...resolved, consentGranularity: granularity };
  if (withGranularity.nearbyMuseums.length > 0 && session.visitContext) {
    session.visitContext.nearbyMuseums = withGranularity.nearbyMuseums;
  }
  return withGranularity;
}
