import { useEffect, useRef } from 'react';

import { useAutoPreCachePreference } from '@/features/settings/application/useAutoPreCachePreference';
import { reportError } from '@/shared/observability/errorReporting';

import { type CityId, CITY_CATALOG } from '../infrastructure/cityCatalog';
import { OFFLINE_STYLE_URL } from '../infrastructure/mapStyleUrl';
import { offlinePackManager } from '../infrastructure/offlinePackManager';
import { haversineDistanceMeters } from './haversine';

/**
 * Distance (meters) at which we consider the user close enough to a city to
 * start pre-caching its offline pack. Matches the challenge roadmap's
 * STEP 4C-E geofence budget.
 */
const PRE_CACHE_TRIGGER_METERS = 500;

interface UseGeofencePreCacheOptions {
  latitude: number | null;
  longitude: number | null;
}

/**
 * Side-effectful hook: when the opt-in preference is enabled and the current
 * user position is within 500 m of one of the catalog cities, silently fires
 * a pack download for that city. De-duplicates by remembering the cities we
 * have already queued in this session so a jittery GPS fix does not kick off
 * the same download twice. Existing packs (complete or in-flight) are
 * detected via `offlinePackManager.hasPack` before we fire createPack.
 */
export const useGeofencePreCache = ({ latitude, longitude }: UseGeofencePreCacheOptions): void => {
  const { enabled } = useAutoPreCachePreference();
  const triggeredRef = useRef<Set<CityId>>(new Set());

  useEffect(() => {
    if (!enabled || latitude === null || longitude === null) return;

    const run = async () => {
      for (const city of CITY_CATALOG) {
        if (triggeredRef.current.has(city.id)) continue;
        const distance = haversineDistanceMeters(
          latitude,
          longitude,
          city.center[1],
          city.center[0],
        );
        if (distance > PRE_CACHE_TRIGGER_METERS) continue;
        triggeredRef.current.add(city.id);
        const already = await offlinePackManager.hasPack(city.id);
        if (already) continue;
        try {
          await offlinePackManager.downloadPack({
            cityId: city.id,
            bounds: city.bounds,
            mapStyleUrl: OFFLINE_STYLE_URL,
          });
        } catch (error) {
          reportError(error, {
            component: 'useGeofencePreCache',
            cityId: city.id,
          });
        }
      }
    };

    void run();
  }, [enabled, latitude, longitude]);
};
